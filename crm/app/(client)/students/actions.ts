"use server";

import { redirect } from "next/navigation";

import { authorize, requireClientActor } from "@/lib/auth/session";
import { getActiveAgreement } from "@/lib/services/agreements";
import { getCompanyProfile } from "@/lib/services/company-profile";
import { pushCompanyProfile } from "@/lib/services/company-sync";
import { prisma } from "@/lib/db/prisma";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  DRAFT_MAX_LENGTH,
  deleteStudentDraft,
  getStudentDraft,
  loadEmployerThreadList,
  saveStudentDraft,
} from "@/lib/services/student-drafts";
import type { StudentThreadItem, StudentThreadView } from "@/lib/students-threads";
import {
  actOnEmployerVacancy,
  createEmployerVacancy,
  fetchStudentThread,
  inviteStudentCandidate,
  markEmployerApplicationViewed,
  markStudentThreadRead,
  sendStudentMessage,
  setEmployerApplicationStatus,
  updateEmployerVacancy,
  type StudentThread,
  type StudentsApplicationStatus,
  type VacancyFields,
} from "@/lib/students-service";

/** Имя сотрудника клиента — для журнала аудита на той стороне (auditService). */
async function actorLabel(userId: string): Promise<string> {
  const user = await prisma.user.findFirst({ where: { id: userId }, select: { fullName: true } });
  return user?.fullName ?? "CRM";
}

export type VacancyFormState = { error?: string; fields?: Record<string, string> };

/**
 * Перед отправкой вакансии на проверку у компании без договора должен быть
 * заполнен профиль: по ИНН и описанию агентство решает, публиковать ли вакансию.
 * У клиента с действующим договором компанию уже проверили — его не задерживаем.
 * Заодно передаём актуальный профиль на платформу, чтобы проверяющий его видел.
 */
async function requireCompanyProfileForReview(clientId: string, label: string): Promise<string | null> {
  const [company, agreement, client] = await Promise.all([
    getCompanyProfile(clientId),
    getActiveAgreement(clientId),
    prisma.client.findFirst({ where: { id: clientId }, select: { status: true } }),
  ]);
  const contracted = Boolean(agreement) || client?.status === "ACTIVE";
  if (!contracted) {
    const missing = [!company?.inn && "ИНН", !company?.description?.trim() && "описание компании"].filter(Boolean);
    if (missing.length > 0) {
      return `Заполните в профиле компании: ${missing.join(" и ")}. Профиль открывается из меню на вашем кружке справа вверху — по нему агентство проверяет компанию перед публикацией.`;
    }
  }
  const sync = await pushCompanyProfile(clientId, label);
  if (sync?.code === "INN_EXISTS") return sync.error;
  return null;
}

function line(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

function parseVacancyFields(formData: FormData): VacancyFields {
  return {
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    responsibilities: line(formData.get("responsibilities")),
    requirements: line(formData.get("requirements")),
    perks: line(formData.get("perks")),
    learnings: line(formData.get("learnings")),
    team: textOrNull(formData.get("team")),
    salaryFrom: numberOrNull(formData.get("salaryFrom")),
    salaryTo: numberOrNull(formData.get("salaryTo")),
    salaryPeriod: (formData.get("salaryPeriod") as VacancyFields["salaryPeriod"]) || "MONTH",
    city: String(formData.get("city") ?? "").trim(),
    district: textOrNull(formData.get("district")),
    address: textOrNull(formData.get("address")),
    addressDetails: textOrNull(formData.get("addressDetails")),
    workFormat: (formData.get("workFormat") as VacancyFields["workFormat"]) || "ONSITE",
    employmentType: (formData.get("employmentType") as VacancyFields["employmentType"]) || "PART_TIME",
    shiftDays: formData.getAll("shiftDays") as VacancyFields["shiftDays"],
    hoursPerWeek: numberOrNull(formData.get("hoursPerWeek")),
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Первая — обложка карточки в ленте студентов; файлы загружаются заранее
    // (см. CoverField и /api/students-vacancy-cover), сюда приходят только адреса
    photos: formData
      .getAll("photo")
      .map((v) => String(v).trim())
      .filter(Boolean),
    videoUrl: textOrNull(formData.get("videoUrl")),
  };
}

export async function createVacancyAction(
  _prev: VacancyFormState,
  formData: FormData,
): Promise<VacancyFormState> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const submit = formData.get("submit") === "true";
  const input = parseVacancyFields(formData);
  const label = await actorLabel(actor.id);

  if (submit) {
    const blocked = await requireCompanyProfileForReview(actor.clientId, label);
    if (blocked) return { error: blocked };
  }

  const result = await createEmployerVacancy({ ...input, crmClientId: actor.clientId, actor: label, submit });
  if (result.error) {
    return { error: result.error.error ?? "Не удалось сохранить вакансию", fields: result.error.fields };
  }
  redirect("/students");
}

export async function updateVacancyAction(
  id: string,
  _prev: VacancyFormState,
  formData: FormData,
): Promise<VacancyFormState> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const submit = formData.get("submit") === "true";
  const input = parseVacancyFields(formData);
  const label = await actorLabel(actor.id);

  if (submit) {
    const blocked = await requireCompanyProfileForReview(actor.clientId, label);
    if (blocked) return { error: blocked };
  }

  const result = await updateEmployerVacancy(id, { ...input, crmClientId: actor.clientId, actor: label, submit });
  if (result.error) {
    return { error: result.error.error ?? "Не удалось сохранить вакансию", fields: result.error.fields };
  }
  redirect("/students");
}

/** Отправить на проверку/опубликовать, снять с публикации или удалить снятую. */
export async function vacancyActionAction(
  id: string,
  action: "submit" | "close" | "delete",
  keep?: boolean,
): Promise<{ error?: string }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const label = await actorLabel(actor.id);
  if (action === "submit") {
    const blocked = await requireCompanyProfileForReview(actor.clientId, label);
    if (blocked) return { error: blocked };
  }
  const result = await actOnEmployerVacancy(id, { crmClientId: actor.clientId, actor: label, action, keep });
  if (result.error) return { error: result.error.error ?? "Не удалось выполнить действие" };
  return {};
}

/** Смена статуса отклика или отметка «просмотрен» при раскрытии карточки. */
export async function applicationAction(
  applicationId: string,
  status: StudentsApplicationStatus | "VIEW",
): Promise<{ error?: string }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const label = await actorLabel(actor.id);
  const result =
    status === "VIEW"
      ? await markEmployerApplicationViewed({ crmClientId: actor.clientId, actor: label, applicationId })
      : await setEmployerApplicationStatus({ crmClientId: actor.clientId, actor: label, applicationId, status });
  if (result.error) return { error: result.error.error ?? "Не удалось выполнить действие" };
  return {};
}

/** Ветка целиком — для живого обновления открытой переписки; с черновиком этого пользователя. */
export async function loadThreadAction(applicationId: string): Promise<StudentThreadView | null> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;
  try {
    const thread = await fetchStudentThread(actor.clientId, applicationId);
    if (!thread) return null;
    const draft = await getStudentDraft(actor.id, applicationId);
    return { ...thread, draft: draft?.body ?? "" };
  } catch {
    return null;
  }
}

/**
 * Список диалогов — то же, для опроса раз в несколько секунд. Только беседы
 * с сообщениями или с черновиком этого пользователя (см. lib/students-threads.ts).
 */
export async function loadThreadsAction(): Promise<StudentThreadItem[] | null> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;
  try {
    return (await loadEmployerThreadList(actor.id, actor.clientId)).items;
  } catch {
    return null;
  }
}

/**
 * Автосохранение черновика сообщения студенту: пустой текст — удаление.
 * Отклик должен принадлежать клиенту этого пользователя: платформа чужую
 * беседу клиенту не отдаёт (404), и черновик на неё не создаётся. Проверка
 * — один поход на платформу при первой записи; уже сохранённый черновик
 * доказал принадлежность раньше, повторять её на каждое нажатие незачем.
 */
export async function saveStudentDraftAction(applicationId: string, body: string): Promise<{ error?: string }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const limit = await guardRate("draft", actor.id);
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) };

  if (body.trim() === "") {
    await deleteStudentDraft(actor.id, applicationId);
    return {};
  }
  if (body.length > DRAFT_MAX_LENGTH) return { error: `Не длиннее ${DRAFT_MAX_LENGTH} символов` };

  if (!(await getStudentDraft(actor.id, applicationId))) {
    let thread: StudentThread | null;
    try {
      thread = await fetchStudentThread(actor.clientId, applicationId);
    } catch {
      return { error: "Не удалось проверить переписку" };
    }
    if (!thread) return { error: "Переписка не найдена" };
  }
  await saveStudentDraft(actor.id, applicationId, body);
  return {};
}

export async function sendStudentMessageAction(applicationId: string, body: string): Promise<{ error?: string }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };
  const label = await actorLabel(actor.id);
  const result = await sendStudentMessage({ crmClientId: actor.clientId, actor: label, applicationId, body });
  if (result.error) return { error: result.error.fields?.body ?? result.error.error ?? "Не удалось отправить" };
  // Ушло — черновик больше не нужен: беседа остаётся в списке уже из-за сообщения
  await deleteStudentDraft(actor.id, applicationId);
  return {};
}

export async function markStudentThreadReadAction(applicationId: string): Promise<void> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return;
  await markStudentThreadRead(actor.clientId, applicationId);
}

export async function inviteCandidateAction(vacancyId: string, studentId: string): Promise<{ error?: string; invited?: boolean }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };
  const label = await actorLabel(actor.id);
  const result = await inviteStudentCandidate({ crmClientId: actor.clientId, actor: label, vacancyId, studentId });
  if (result.error) return { error: result.error.error ?? "Не удалось пригласить" };
  return { invited: result.invited };
}
