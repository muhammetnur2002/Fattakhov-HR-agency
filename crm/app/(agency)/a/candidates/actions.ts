"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessDeniedError, canDo } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  addToVacancy,
  ApplicationError,
  markConsentGiven,
  moveStage,
  presentToClient,
  recordGuaranteeCase,
  recordOffer,
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
import { markSourcingNotice, SourcingError } from "@/lib/services/sourcing";
import {
  createDisclosureLink,
  DisclosureError,
  markDisclosureManually,
} from "@/lib/services/disclosure-consent";
import { transitionVacancy } from "@/lib/services/vacancies";
import { VacancyTransitionError } from "@/lib/services/vacancy-status";
import { FileValidationError } from "@/lib/storage";
import {
  candidateProfileSchema,
  guaranteeCaseSchema,
  offerSchema,
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

  // Новый кандидат — сорсинг-лид: файлы только после согласия. Отказ
  // до создания карточки, иначе человек увидел бы ошибку, а кандидат
  // всё равно завёлся бы (форма, открытая до выкатки, ещё шлёт резюме)
  const resume = formData.get("resume");
  if (resume instanceof File && resume.size > 0) {
    return {
      error:
        "Резюме загружается после согласия кандидата: пока его нет, храним только имя, контакты и ссылку на профиль.",
    };
  }

  let candidateId: string;
  try {
    authorizeOrThrow(actor, "application.create");
    const created = await quickCreateCandidate(actor, parsed.data);
    candidateId = created.id;
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof SourcingError) return { error: error.message };
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
    if (error instanceof SourcingError) return { error: error.message };
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

/**
 * Ссылка кандидату на подтверждение передачи конкретному работодателю.
 *
 * Отдельно от createConsentLinkAction, потому что это другое согласие
 * и другая привязка: то — к кандидату, это — к паре «кандидат + вакансия».
 */
export async function createDisclosureLinkAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState & { disclosureUrl?: string }> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") || "");

  try {
    authorizeOrThrow(actor, "application.present");
    const token = await createDisclosureLink(actor, applicationId);

    revalidatePath(`/a/applications/${applicationId}`);
    return {
      ok: "Ссылка готова — отправьте кандидату",
      disclosureUrl: `${appOrigin()}/disclosure/${token}`,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof DisclosureError) return { error: error.message };
    throw error;
  }
}

/**
 * Запасной путь: подтверждение получено вне системы.
 *
 * Режим контактов спрашиваем и здесь: по документу это выбор кандидата,
 * а не наше умолчание, и «рекрутер не выбрал» не должно молча означать
 * «можно отдавать телефон».
 */
export async function markDisclosureAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") || "");
  const contactMode = String(formData.get("contactMode") || "");

  if (contactMode !== "DIRECT" && contactMode !== "VIA_AGENCY") {
    return { error: "Выберите, разрешил ли кандидат передать контакты" };
  }

  try {
    authorizeOrThrow(actor, "application.present");
    await markDisclosureManually(actor, applicationId, contactMode);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof DisclosureError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/applications/${applicationId}`);
  return { ok: "Подтверждение отмечено" };
}

/**
 * Отметить, что сорсинг-лида уведомили: кто мы, откуда его данные, зачем
 * и какие у него права (ст. 18 152-ФЗ). Уведомить можно письмом, звонком
 * или ссылкой на согласие — отметка фиксирует факт и попадает в журнал ПДн.
 */
export async function markSourcingNoticeAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  try {
    authorizeOrThrow(actor, "application.viewInternal");
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!candidate) return { error: "Кандидат не найден" };
    await markSourcingNotice({
      candidateId,
      organizationId: actor.organizationId,
      actorId: actor.id,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  revalidatePath(`/a/candidates/${candidateId}`);
  return { ok: "Отмечено: кандидат уведомлён" };
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
    if (error instanceof SourcingError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/candidates/${candidateId}`);
  return { ok: "Резюме загружено" };
}

/**
 * Внести условия оффера.
 *
 * Право то же, что у перевода по этапам: оффер — часть работы с воронкой,
 * и без него кандидата нельзя перевести в «Вышел на работу» (см. moveStage).
 */
export async function recordOfferAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") ?? "");

  const parsed = offerSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    authorizeOrThrow(actor, "application.moveStage");
    await recordOffer(actor, applicationId, parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/applications/${applicationId}`);
  return { ok: "Оффер сохранён — теперь кандидата можно перевести в «Вышел на работу»" };
}

/**
 * Записать гарантийный случай и, по желанию, вернуть вакансию в работу.
 *
 * Возврат — отдельное право (vacancy.reactivate, владелец и руководитель
 * подбора): закрытие уже посчитано в отчётах и в счёте. Если права нет,
 * случай всё равно записывается, а про вакансию человек видит, к кому
 * идти, — иначе гарантийный уход терялся бы из-за того, что его
 * заметил рекрутер, а не руководитель.
 */
export async function recordGuaranteeCaseAction(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  const actor = await requireAgencyActor();
  const applicationId = String(formData.get("applicationId") ?? "");

  const parsed = guaranteeCaseSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  let vacancyId: string;
  try {
    authorizeOrThrow(actor, "application.moveStage");
    ({ vacancyId } = await recordGuaranteeCase(actor, applicationId, parsed.data));
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  /*
    Возврат вакансии — уже после записи случая и отдельно от неё. Случай
    к этому моменту сохранён, и отказ вакансии (нет действующего договора —
    BR-1, гарантия нередко переживает договор) не должен выглядеть
    ошибкой всего действия: человек решил бы, что случай не записался,
    и записал бы его снова.
  */
  let reopenNote = "";
  if (parsed.data.reopenVacancy) {
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: vacancyId, organizationId: actor.organizationId },
      select: { status: true },
    });
    if (vacancy && vacancy.status !== "ACTIVE") {
      if (!canDo(actor, "vacancy.reactivate")) {
        reopenNote =
          " Вакансию вернуть в работу может владелец или руководитель подбора — сообщите им.";
      } else {
        try {
          await transitionVacancy(actor, vacancyId, "ACTIVE");
          reopenNote = " Вакансия снова в работе.";
        } catch (error) {
          if (!(error instanceof VacancyTransitionError)) throw error;
          reopenNote = ` Вакансию в работу не вернули: ${error.message}.`;
        }
      }
    }
  }

  revalidatePath(`/a/applications/${applicationId}`);
  return {
    ok:
      "Гарантийный случай записан. Следующий найм по этой вакансии будет отмечен как замена и в счёт не попадёт." +
      reopenNote,
  };
}
