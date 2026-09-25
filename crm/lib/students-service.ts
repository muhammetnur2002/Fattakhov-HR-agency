import "server-only";

import { studentsFileProxyUrl } from "@/lib/students-file-url";
import { studentsUrl } from "@/lib/urls";

export { studentsFileProxyUrl };

/**
 * Служебные вызовы на студенческую платформу — сервер CRM обращается к
 * её API напрямую, без захода сотрудника на тот сайт (заявки на
 * привязку клиента; дальше сюда же лягут справки и модерация).
 *
 * Секрет — CRM_SERVICE_SECRET, отдельный от STUDENTS_SSO_SECRET (тот
 * подписывает билеты входа человека через редирект, у вызовов здесь
 * пользователя вообще нет).
 */

export interface CrmLinkRequest {
  employerId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  inn: string | null;
  city: string | null;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  requestedAt: string;
}

export interface ModerationCompany {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  inn: string | null;
  phone: string | null;
  freeEmail: boolean;
  logoUrl: string | null;
  city: string | null;
  about: string | null;
  website: string | null;
  createdAt: string;
  pendingVacancies: number;
}

export interface ModerationVacancy {
  companyId: string;
  companyStatus: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  version: string;
  vacancy: {
    id: string;
    title: string;
    company: string;
    companyLogoUrl: string | null;
    summary: string;
    city: string;
    salaryFrom: number | null;
    salaryTo: number | null;
    salaryPeriod: "MONTH" | "SHIFT" | "HOUR";
    photos: string[];
  };
}

export interface ModerationQueue {
  companies: ModerationCompany[];
  vacancies: ModerationVacancy[];
}

export interface PendingStudyStudent {
  id: string;
  fullName: string;
  photoUrl: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  city: string | null;
  studyDocUrl: string | null;
  studyDocName: string | null;
  studyDocAt: string | null;
}

export interface PilotMetrics {
  students: { registered: number; completedProfile: number; applied: number; gotOpportunity: number; verified: number };
  companies: { total: number; selfRegistered: number; approved: number; withPublishedVacancy: number };
  vacancies: { published: number; fromCabinet: number };
  applications: { total: number; viewed: number; nextStep: number; hired: number };
  profileViews: number;
  timing: { firstApplicationHours: number | null; firstOpportunityDays: number | null };
}

function serviceSecret(): string | null {
  const raw = process.env.CRM_SERVICE_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

export class StudentsServiceError extends Error {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const secret = serviceSecret();
  const url = studentsUrl(path);
  if (!secret || !url) {
    throw new StudentsServiceError(
      "Служебный вызов на студенческую платформу не настроен: нужны STUDENTS_URL и CRM_SERVICE_SECRET",
    );
  }
  return fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
}

/** Читает файл со студенческой платформы служебным секретом — для прокси-роута выше. */
export async function fetchStudentsFile(path: string): Promise<Response> {
  return call(path);
}

/** Заявки компаний на объединение со своим профилем в CRM. */
export async function fetchCrmLinkRequests(): Promise<CrmLinkRequest[]> {
  const response = await call("/api/service/crm-links");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { requests: CrmLinkRequest[] };
  return data.requests;
}

/** Одобрить заявку — компания получает crmClientId у себя. */
export async function resolveCrmLinkRequest(employerId: string, crmClientId: string): Promise<void> {
  const response = await call(`/api/service/crm-links/${employerId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ crmClientId }),
  });
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
}

/** Отклонить заявку с пояснением — компания увидит его у себя. */
export async function rejectCrmLinkRequest(employerId: string, note: string): Promise<void> {
  const response = await call(`/api/service/crm-links/${employerId}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
}

/** Компании и вакансии, ждущие модерации. */
export async function fetchModerationQueue(): Promise<ModerationQueue> {
  const response = await call("/api/service/moderation");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return (await response.json()) as ModerationQueue;
}

/** Решение по компании или вакансии — actor уходит в журнал аудита студенческой платформы. */
export async function decideModeration(input: {
  entity: "company" | "vacancy";
  id: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
  version?: string;
  actor: string;
}): Promise<{ error?: string }> {
  const response = await call("/api/service/moderation", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { error: data.error ?? `Студенческая платформа ответила ${response.status}` };
  }
  return {};
}

/** Справки студентов, ждущие решения. */
export async function fetchPendingStudyReview(): Promise<PendingStudyStudent[]> {
  const response = await call("/api/service/study");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { students: PendingStudyStudent[] };
  return data.students;
}

/** Решение по справке — подтверждает учёбу или отклоняет с пояснением. */
export async function decideStudyReview(input: {
  studentId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
  actor: string;
}): Promise<{ error?: string }> {
  const response = await call("/api/service/study", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { error: data.error ?? `Студенческая платформа ответила ${response.status}` };
  }
  return {};
}

/** Метрики пилота — только чтение. */
export async function fetchPilotMetrics(): Promise<PilotMetrics> {
  const response = await call("/api/service/pilot");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return (await response.json()) as PilotMetrics;
}
