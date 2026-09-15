"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireActor, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  createVacancyDraft,
  transitionVacancy,
  updateVacancyBrief,
} from "@/lib/services/vacancies";
import {
  clientCanEditBrief,
  VacancyTransitionError,
} from "@/lib/services/vacancy-status";
import {
  vacancyDraftSchema,
  vacancySubmitSchema,
} from "@/lib/validation/vacancy";

export type DraftState = {
  vacancyId?: string;
  savedAt?: string;
  error?: string;
};

/**
 * Чья это заявка.
 *
 * Пользователь клиента заводит только на свою компанию, что бы ни
 * пришло с формы: подменённый clientId в запросе не должен позволять
 * завести вакансию соседней компании. Сотрудник агентства выбирает
 * клиента сам, поэтому у него значение берётся из формы.
 */
async function resolveClientId(
  actor: { clientId: string | null },
  requested?: string,
): Promise<string | null> {
  if (actor.clientId) return actor.clientId;
  const clean = requested?.trim();
  return clean ? clean : null;
}

/**
 * Автосохранение черновика (BR-20).
 *
 * Первый вызов создаёт вакансию, последующие обновляют её. Так черновик
 * не появляется от одного открытия формы, но и не теряется, если человек
 * закрыл вкладку на третьем шаге.
 *
 * Работает с обеих сторон: клиент заводит заявку сам, агентство заводит
 * её за клиента, когда тот продиктовал вакансию голосом. Путь дальше
 * один и тот же, чтобы не появилось второго набора правил.
 */
export async function saveDraftAction(
  values: Record<string, unknown>,
  vacancyId?: string,
  clientIdFromForm?: string,
): Promise<DraftState> {
  const actor = await requireActor();
  const clientId = await resolveClientId(actor, clientIdFromForm);
  if (!clientId) return { error: "Выберите клиента" };

  const parsed = vacancyDraftSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  const title = String(values.title ?? "").trim();
  if (!title) return { error: "Укажите название позиции" };

  try {
    authorizeOrThrow(actor, "vacancy.create", { clientId });

    if (!vacancyId) {
      const created = await createVacancyDraft(actor, clientId, {
        ...parsed.data,
        title,
      });
      revalidatePath("/vacancies");
      revalidatePath("/a/vacancies");
      return { vacancyId: created.id, savedAt: new Date().toISOString() };
    }

    // Правка возможна, только пока заявка не ушла в работу (BR-21)
    const existing = await prisma.vacancy.findFirst({
      where: { id: vacancyId, clientId },
      select: { status: true },
    });
    if (!existing) return { error: "Заявка не найдена" };
    if (!clientCanEditBrief(existing.status)) {
      return { error: "Заявка уже в работе — изменения через обсуждение" };
    }

    await updateVacancyBrief(actor, vacancyId, { ...parsed.data, title });
    revalidatePath(`/vacancies/${vacancyId}`);
    return { vacancyId, savedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }
}

export type SubmitState = { error?: string; vacancyId?: string };

/** Отправка заявки в работу (сценарий A, шаг 6). */
export async function submitVacancyAction(
  vacancyId: string,
  values: Record<string, unknown>,
  clientIdFromForm?: string,
): Promise<SubmitState> {
  const actor = await requireActor();
  const clientId = await resolveClientId(actor, clientIdFromForm);
  if (!clientId) return { error: "Выберите клиента" };

  // Требования к отправке жёстче, чем к черновику
  const parsed = vacancySubmitSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Заполните бриф" };
  }

  try {
    authorizeOrThrow(actor, "vacancy.create", { clientId });

    const saved = await saveDraftAction(values, vacancyId, clientId);
    if (saved.error) return { error: saved.error };

    await transitionVacancy(actor, vacancyId, "SUBMITTED");
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    throw error;
  }

  revalidatePath("/vacancies");
  revalidatePath("/a/vacancies");
  revalidatePath(`/vacancies/${vacancyId}`);
  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { vacancyId };
}

export type VacancyActionState = { error?: string; ok?: string };

/** Клиент приостанавливает или отменяет свою заявку. */
export async function clientTransitionAction(
  _prev: VacancyActionState,
  formData: FormData,
): Promise<VacancyActionState> {
  const actor = await requireClientActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const to = String(formData.get("to") || "");
  const closeReason = String(formData.get("closeReason") || "");

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, clientId: actor.clientId ?? "" },
    select: { hiringManagerId: true, clientId: true },
  });
  if (!vacancy) return { error: "Заявка не найдена" };

  const subject = {
    clientId: vacancy.clientId,
    hiringManagerId: vacancy.hiringManagerId,
  };

  try {
    authorizeOrThrow(
      actor,
      to === "ON_HOLD" ? "vacancy.hold" : "vacancy.close",
      subject,
    );
    await transitionVacancy(
      actor,
      vacancyId,
      to as Parameters<typeof transitionVacancy>[2],
      { closeReason },
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyTransitionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/vacancies/${vacancyId}`);
  return { ok: "Статус изменён" };
}
