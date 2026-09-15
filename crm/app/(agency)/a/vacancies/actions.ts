"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { CommentError, createComment } from "@/lib/services/comments";
import { assignRecruiters, transitionVacancy } from "@/lib/services/vacancies";
import { VacancyTransitionError } from "@/lib/services/vacancy-status";
import {
  assignRecruitersSchema,
  vacancyEstimateSchema,
} from "@/lib/validation/vacancy";

export type AgencyVacancyState = { error?: string; ok?: string };

/** Клиент вакансии — нужен для проверки прав по матрице. */
async function loadSubject(actor: { organizationId: string }, vacancyId: string) {
  return prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: { clientId: true, hiringManagerId: true, status: true },
  });
}

/** Оценка сроков: перевод в ESTIMATED с датой первых кандидатов (BR-2). */
export async function estimateVacancyAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");

  const vacancy = await loadSubject(actor, vacancyId);
  if (!vacancy) return { error: "Вакансия не найдена" };

  const parsed = vacancyEstimateSchema.safeParse({
    estimatedFirstCandidatesAt: formData.get("estimatedFirstCandidatesAt"),
    estimatedCloseAt: formData.get("estimatedCloseAt") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте даты" };
  }

  try {
    authorizeOrThrow(actor, "vacancy.accept", { clientId: vacancy.clientId });
    await transitionVacancy(actor, vacancyId, "ESTIMATED", {
      estimatedFirstCandidatesAt: parsed.data.estimatedFirstCandidatesAt,
      estimatedCloseAt: parsed.data.estimatedCloseAt ?? null,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Сроки отправлены клиенту" };
}

/** Взять заявку в работу. Здесь же создаются этапы воронки. */
export async function activateVacancyAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const estimated = String(formData.get("estimatedFirstCandidatesAt") || "");
  const leadRecruiterId = String(formData.get("leadRecruiterId") || "");

  const vacancy = await loadSubject(actor, vacancyId);
  if (!vacancy) return { error: "Вакансия не найдена" };

  try {
    authorizeOrThrow(actor, "vacancy.accept", { clientId: vacancy.clientId });
    await transitionVacancy(actor, vacancyId, "ACTIVE", {
      estimatedFirstCandidatesAt: estimated ? new Date(estimated) : undefined,
    });

    /*
      Ведущий назначается тем же действием, если его выбрали.
      Запуск и назначение были двумя отдельными походами — в разные
      вкладки и с отдельным сохранением, — и вакансия штатно уходила
      в работу без единого ответственного.
    */
    if (leadRecruiterId) {
      authorizeOrThrow(actor, "vacancy.assignRecruiter", {
        clientId: vacancy.clientId,
      });
      await assignRecruiters(actor, vacancyId, leadRecruiterId, [leadRecruiterId]);
    }
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return {
    ok: leadRecruiterId
      ? "Вакансия в работе, воронка создана, ведущий назначен"
      : "Вакансия в работе, воронка создана",
  };
}

/**
 * Запрос уточнений по брифу.
 *
 * Сам вопрос — часть действия, а не отдельная забота. Раньше кнопка
 * меняла статус молча: клиент получал «уточните» без единого слова
 * о том, что именно неясно, и вопрос приходилось отдельно писать
 * в обсуждении. Половина смысла действия терялась ровно там.
 */
export async function clarifyVacancyAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const question = String(formData.get("question") || "").trim();

  if (!question) {
    return { error: "Напишите, что именно нужно уточнить" };
  }

  const vacancy = await loadSubject(actor, vacancyId);
  if (!vacancy) return { error: "Вакансия не найдена" };

  try {
    authorizeOrThrow(actor, "vacancy.accept", { clientId: vacancy.clientId });
    // Сначала вопрос, потом статус: если запись комментария не удалась,
    // заявка не должна уехать к клиенту пустой
    await createComment(actor, {
      vacancyId,
      body: question,
      visibility: "SHARED",
    });
    await transitionVacancy(actor, vacancyId, "CLARIFYING");
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Вопрос отправлен клиенту" };
}

/** Приостановка, закрытие, реактивация со стороны агентства. */
export async function agencyTransitionAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const to = String(formData.get("to") || "") as VacancyStatus;
  const closeReason = String(formData.get("closeReason") || "");

  const vacancy = await loadSubject(actor, vacancyId);
  if (!vacancy) return { error: "Вакансия не найдена" };

  try {
    authorizeOrThrow(
      actor,
      to === "ON_HOLD" ? "vacancy.hold" : "vacancy.close",
      { clientId: vacancy.clientId },
    );
    await transitionVacancy(actor, vacancyId, to, { closeReason });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Статус изменён" };
}

export async function assignRecruitersAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");

  const parsed = assignRecruitersSchema.safeParse({
    leadRecruiterId: formData.get("leadRecruiterId"),
    recruiterIds: formData.getAll("recruiterIds").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте выбор" };
  }

  try {
    authorizeOrThrow(actor, "vacancy.assignRecruiter");
    const updated = await assignRecruiters(
      actor,
      vacancyId,
      parsed.data.leadRecruiterId ?? null,
      parsed.data.recruiterIds,
    );
    if (!updated) return { error: "Вакансия не найдена" };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Назначать рекрутеров может только руководство" };
    }
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Команда назначена" };
}

/** Внутренние заметки агентства. Клиенту не видны никогда. */
export async function saveAgencyNotesAction(
  _prev: AgencyVacancyState,
  formData: FormData,
): Promise<AgencyVacancyState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const notes = String(formData.get("agencyNotes") || "").slice(0, 5000);

  const vacancy = await loadSubject(actor, vacancyId);
  if (!vacancy) return { error: "Вакансия не найдена" };

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    await prisma.vacancy.update({
      where: { id: vacancyId },
      data: { agencyNotes: notes || null },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Заметки сохранены" };
}
