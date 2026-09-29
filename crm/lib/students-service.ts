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

/**
 * Компания, одобренная на студенческой платформе, но без клиента в CRM
 * и без заявки на привязку — раньше такие пропадали из виду среди
 * клиентов насовсем, видна была только заявка, если компания сама её
 * оставляла.
 */
export interface ApprovedCompany {
  employerId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  inn: string | null;
  city: string | null;
  createdAt: string;
  pendingVacancies: number;
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
    requirements: string[];
    perks: string[];
    learnings: string[];
    city: string;
    district: string | null;
    address: string | null;
    addressDetails: string | null;
    workFormat: "ONSITE" | "HYBRID" | "REMOTE";
    employmentType: "PART_TIME" | "SHIFT" | "PROJECT" | "INTERNSHIP" | "FULL_TIME";
    tags: string[];
    isHot: boolean;
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

/** Компании, одобренные на платформе, но без клиента в CRM и без заявки на привязку. */
export async function fetchApprovedCompanies(): Promise<ApprovedCompany[]> {
  const response = await call("/api/service/companies");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { companies: ApprovedCompany[] };
  return data.companies;
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

/**
 * Вакансии клиента на студенческой платформе — без захода клиента туда
 * (см. app/(client)/students/*). Поля и правила те же, что в кабинете
 * компании там (lib/vacancy.ts на той стороне): лимит на компанию,
 * автопубликация по действующему договору.
 */

export type StudentsVacancyStatus = "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CLOSED";

export interface EmployerVacancyDTO {
  id: string;
  title: string;
  status: StudentsVacancyStatus;
  fromCrm: boolean;
  moderationNote: string | null;
  applications: number;
  city: string;
  employmentType: "PART_TIME" | "SHIFT" | "PROJECT" | "INTERNSHIP" | "FULL_TIME";
  updatedAt: string;
  keepAfterClose: boolean | null;
}

export interface VacancyFields {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  learnings: string[];
  team: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: "MONTH" | "SHIFT" | "HOUR";
  city: string;
  district: string | null;
  address: string | null;
  addressDetails: string | null;
  workFormat: "ONSITE" | "HYBRID" | "REMOTE";
  employmentType: "PART_TIME" | "SHIFT" | "PROJECT" | "INTERNSHIP" | "FULL_TIME";
  shiftDays: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  hoursPerWeek: number | null;
  tags: string[];
  photos: string[];
  videoUrl: string | null;
}

export interface VacancyDetail extends VacancyFields {
  id: string;
  status: StudentsVacancyStatus;
  crmId: string | null;
  moderationNote: string | null;
  keepAfterClose: boolean | null;
}

export interface StudentsApiError {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

async function parseError(response: Response): Promise<StudentsApiError> {
  const data = (await response.json().catch(() => ({}))) as StudentsApiError;
  return { error: data.error ?? `Студенческая платформа ответила ${response.status}`, code: data.code, fields: data.fields };
}

/** Все вакансии клиента, всех статусов. */
export async function fetchEmployerVacancies(crmClientId: string): Promise<EmployerVacancyDTO[]> {
  const response = await call(`/api/service/employer/vacancies?crmClientId=${encodeURIComponent(crmClientId)}`);
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { vacancies: EmployerVacancyDTO[] };
  return data.vacancies;
}

/** Одна вакансия — для формы правки. Null — не найдена или ведётся из CRM отдельно. */
export async function fetchEmployerVacancy(crmClientId: string, id: string): Promise<VacancyDetail | null> {
  const response = await call(`/api/service/employer/vacancies/${id}?crmClientId=${encodeURIComponent(crmClientId)}`);
  if (response.status === 404 || response.status === 409) return null;
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { vacancy: VacancyDetail };
  return data.vacancy;
}

/** Новая вакансия. submit — черновик (false) или сразу на проверку/публикацию (true). */
export async function createEmployerVacancy(
  input: VacancyFields & { crmClientId: string; actor: string; submit: boolean },
): Promise<{ error?: StudentsApiError; id?: string; status?: StudentsVacancyStatus }> {
  const response = await call("/api/service/employer/vacancies", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) return { error: await parseError(response) };
  const data = (await response.json()) as { id: string; status: StudentsVacancyStatus };
  return data;
}

/** Правка вакансии. */
export async function updateEmployerVacancy(
  id: string,
  input: VacancyFields & { crmClientId: string; actor: string; submit: boolean },
): Promise<{ error?: StudentsApiError; id?: string; status?: StudentsVacancyStatus }> {
  const response = await call(`/api/service/employer/vacancies/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!response.ok) return { error: await parseError(response) };
  const data = (await response.json()) as { id: string; status: StudentsVacancyStatus };
  return data;
}

/** Действие: отправить на проверку/опубликовать, снять или удалить. */
export async function actOnEmployerVacancy(
  id: string,
  input: { crmClientId: string; actor: string; action: "submit" | "close" | "delete"; keep?: boolean },
): Promise<{ error?: StudentsApiError; id?: string; status?: StudentsVacancyStatus; deleted?: boolean }> {
  const response = await call(`/api/service/employer/vacancies/${id}`, { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) return { error: await parseError(response) };
  return (await response.json()) as { id: string; status?: StudentsVacancyStatus; deleted?: boolean };
}

/** Адреса, где клиент уже нанимал, — подсказки в форме вакансии. */
export async function fetchEmployerAddresses(
  crmClientId: string,
): Promise<{ city: string; district: string | null; address: string; addressDetails: string | null }[]> {
  const response = await call(`/api/service/employer/addresses?crmClientId=${encodeURIComponent(crmClientId)}`);
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { addresses: { city: string; district: string | null; address: string; addressDetails: string | null }[] };
  return data.addresses;
}

/** Отклики студентов на вакансии клиента — прямо в CRM, без захода на платформу. */

export type StudentsApplicationStatus = "NEW" | "VIEWED" | "INVITED" | "INTERVIEW" | "HIRED" | "REJECTED";

export interface EmployerApplication {
  id: string;
  status: StudentsApplicationStatus;
  createdAt: string;
  statusChangedAt: string;
  employerNote: string | null;
  vacancyId: string;
  vacancyTitle: string;
  student: {
    fullName: string;
    email: string;
    phone: string | null;
    age: number;
    university: string;
    speciality: string;
    studyYear: number;
    studyVerified: boolean;
    city: string | null;
    workDays: string[];
    hoursPerWeek: number | null;
    skills: string[];
    about: string | null;
  };
}

export async function fetchEmployerApplications(crmClientId: string): Promise<EmployerApplication[]> {
  const response = await call(`/api/service/employer/applications?crmClientId=${encodeURIComponent(crmClientId)}`);
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { applications: EmployerApplication[] };
  return data.applications;
}

export async function setEmployerApplicationStatus(input: {
  crmClientId: string;
  actor: string;
  applicationId: string;
  status: StudentsApplicationStatus;
}): Promise<{ error?: StudentsApiError }> {
  const response = await call("/api/service/employer/applications", { method: "PATCH", body: JSON.stringify(input) });
  return response.ok ? {} : { error: await parseError(response) };
}

/** Карточку открыли: новый отклик становится «просмотренным». */
export async function markEmployerApplicationViewed(input: {
  crmClientId: string;
  actor: string;
  applicationId: string;
}): Promise<{ error?: StudentsApiError }> {
  const response = await call("/api/service/employer/applications", { method: "POST", body: JSON.stringify(input) });
  return response.ok ? {} : { error: await parseError(response) };
}
