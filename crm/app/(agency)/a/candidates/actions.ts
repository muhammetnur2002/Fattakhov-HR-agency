"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessDeniedError, canDo } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import {
  addToVacancy,
  ApplicationError,
  markConsentGiven,
  moveStage,
  presentToClient,
  rejectApplication,
} from "@/lib/services/applications";
import {
  attachFile,
  findSimilarCandidates,
  quickCreateCandidate,
  searchCandidates,
  updateCandidateProfile,
  type DuplicateWarning,
} from "@/lib/services/candidates";
import { ConsentError, createConsentLink } from "@/lib/services/consent";
import { FileValidationError } from "@/lib/storage";
import {
  candidateProfileSchema,
  presentSchema,
  quickCandidateSchema,
  rejectSchema,
} from "@/lib/validation/candidate";
import { appOrigin } from "@/lib/urls";

export type CandidateState = { error?: string; ok?: string };

/**
 * Проверка дубликатов при вводе (BR-7).
 *
 * Смысл не в чистоте базы, а в том, чтобы рекрутер не представил одного
 * человека двум клиентам одновременно, сам того не зная. Поэтому
 * возвращаем не «такой уже есть», а где именно он сейчас в работе.
 */
export async function checkDuplicatesAction(params: {
  fullName?: string;
  phone?: string;
  email?: string;
}): Promise<DuplicateWarning[]> {
  const actor = await requireAgencyActor();
  if (!canDo(actor, "application.create")) return [];
  return findSimilarCandidates(actor, params);
}

function formToObject(formData: FormData): Record<string, unknown> {
  const entries = [...formData.entries()].filter(
    ([, v]) => typeof v === "string",
  );
  return Object.fromEntries(entries);
}

/** Быстрое добавление кандидата в базу агентства. */
export async function createCandidateAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();

  const parsed = quickCandidateSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  let candidateId: string;
  try {
    authorizeOrThrow(actor, "application.create");
    const created = await quickCreateCandidate(actor, parsed.data);
    candidateId = created.id;

    const resume = formData.get("resume");
    if (resume instanceof File && resume.size > 0) {
      await attachFile(actor, { candidateId, file: resume, kind: "RESUME" });
    }
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath("/a/candidates");

  // Кандидата добавляли под конкретную вакансию — сразу кладём его в воронку
  const vacancyId = String(formData.get("vacancyId") || "");
  if (vacancyId) {
    try {
      await addToVacancy(actor, vacancyId, candidateId);
      revalidatePath(`/a/vacancies/${vacancyId}`);
      redirect(`/a/vacancies/${vacancyId}`);
    } catch (error) {
      if (error instanceof ApplicationError) return { error: error.message };
      throw error;
    }
  }

  redirect(`/a/candidates/${candidateId}`);
}

export async function updateCandidateAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  const parsed = candidateProfileSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    const updated = await updateCandidateProfile(actor, candidateId, parsed.data);
    if (!updated) return { error: "Кандидат не найден" };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  revalidatePath(`/a/candidates/${candidateId}`);
  return { ok: "Профиль сохранён" };
}

/**
 * Поиск по общей базе для привязки уже существующего кандидата к новой
 * вакансии — тот же поиск, что и на /a/candidates, только на 8 карточек:
 * это выпадающий список внутри диалога, а не отдельная страница.
 */
export async function searchExistingCandidatesAction(query: string) {
  const actor = await requireAgencyActor();
  if (!canDo(actor, "application.create")) return [];
  if (!query.trim()) return [];
  const { items } = await searchCandidates(actor, { query, take: 8 });
  return items;
}

/** Добавление кандидата из базы в воронку вакансии. */
export async function addToVacancyAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const vacancyId = String(formData.get("vacancyId") || "");
  const candidateId = String(formData.get("candidateId") || "");

  try {
    authorizeOrThrow(actor, "application.create");
    await addToVacancy(actor, vacancyId, candidateId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/vacancies/${vacancyId}`);
  return { ok: "Кандидат добавлен в воронку" };
}

/** Перетаскивание карточки в канбане. */
export async function moveStageAction(params: {
  applicationId: string;
  toStageId: string;
  comment?: string;
}): Promise<CandidateState> {
  const actor = await requireAgencyActor();

  try {
    authorizeOrThrow(actor, "application.moveStage");
    await moveStage(
      actor,
      params.applicationId,
      params.toStageId,
      params.comment,
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  return { ok: "Этап изменён" };
}

/**
 * Массовый перевод на этап.
 *
 * Разбор пачки откликов — это одно решение про десяток человек, а не
 * десять отдельных решений: рекрутёр смотрит список и понимает, кого
 * ведём дальше, а кого нет. Поэтому одно действие на всех, а не по
 * запросу на карточку.
 *
 * Каждый перевод проверяется отдельно и по тем же правилам, что и
 * одиночный: сервис один и тот же. Часть может не пройти (возврат
 * назад без комментария, «Представлен клиенту»), и это не повод
 * отменять остальные — возвращаем, что именно не поехало.
 */
export async function moveStageBulkAction(params: {
  applicationIds: string[];
  toStageId: string;
  comment?: string;
}): Promise<{ ok?: string; error?: string; failedIds?: string[] }> {
  const actor = await requireAgencyActor();

  try {
    authorizeOrThrow(actor, "application.moveStage");
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  const failedIds: string[] = [];
  const reasons = new Set<string>();
  let moved = 0;

  // Последовательно, а не Promise.all: каждый перевод пишет историю
  // этапов, и параллельная запись здесь ничего не ускоряет, зато
  // мешает читать журнал
  for (const applicationId of params.applicationIds) {
    try {
      await moveStage(actor, applicationId, params.toStageId, params.comment);
      moved += 1;
    } catch (error) {
      if (error instanceof ApplicationError) {
        failedIds.push(applicationId);
        reasons.add(error.message);
        continue;
      }
      throw error;
    }
  }

  if (failedIds.length > 0) {
    return {
      ok: moved > 0 ? `Переведено: ${moved}` : undefined,
      error: [...reasons].join(". "),
      failedIds,
    };
  }

  return { ok: `Переведено: ${moved}` };
}

export async function presentAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") || "");

  const parsed = presentSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    authorizeOrThrow(actor, "application.present");
    await presentToClient(actor, applicationId, parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/applications/${applicationId}`);
  return { ok: "Кандидат представлен клиенту" };
}

export async function rejectAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") || "");

  const parsed = rejectSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Укажите причину отказа" };
  }

  try {
    authorizeOrThrow(actor, "application.moveStage");
    await rejectApplication(actor, applicationId, parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/applications/${applicationId}`);
  return { ok: "Отказ зафиксирован" };
}

/**
 * Отметка о полученном согласии на обработку ПДн (BR-33).
 * Полноценная форма согласия по публичной ссылке — Этап 10.
 */
export async function markConsentAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    await markConsentGiven(actor, candidateId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/candidates/${candidateId}`);
  return { ok: "Согласие отмечено" };
}

/**
 * Ссылка на форму согласия для кандидата (BR-33).
 *
 * Основной путь: кандидат подтверждает сам, и это фиксируется с временем,
 * адресом и версией текста. Ручная отметка остаётся для случая, когда
 * согласие взято на бумаге.
 */
export async function createConsentLinkAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState & { consentUrl?: string }> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    const token = await createConsentLink(actor, candidateId);
    const baseUrl = appOrigin();

    revalidatePath(`/a/candidates/${candidateId}`);
    return {
      ok: "Ссылка готова — отправьте кандидату",
      consentUrl: `${baseUrl}/consent/${token}`,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ConsentError) return { error: error.message };
    throw error;
  }
}

export async function uploadResumeAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл" };
  }

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    await attachFile(actor, { candidateId, file, kind: "RESUME" });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/candidates/${candidateId}`);
  return { ok: "Резюме загружено" };
}
