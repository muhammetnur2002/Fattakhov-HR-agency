import "server-only";

import type { FunnelActivity } from "@/lib/students-funnel";
import { prisma } from "@/lib/db/prisma";
import { isDeliverableEmail } from "@/lib/notifications/deliverable";
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
  /** Кто публикует: реквизиты и «о компании» — чем проверять вакансию. Нет у ответа старой платформы. */
  company?: {
    name: string;
    inn: string | null;
    about: string | null;
    website: string | null;
    city: string | null;
    logoUrl: string | null;
    /** Клиент с действующим договором — компанию агентство уже знает */
    contracted: boolean;
  };
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

/** Поиск студентов открывается после договора: платформа отвечает 403 CANDIDATES_LOCKED. */
export class CandidatesLockedError extends StudentsServiceError {}

/**
 * Идентификатор в адресе служебного запроса. Значения приходят из форм клиента, а запрос уходит
 * со служебным секретом: «../../crm-links/…» иначе превратился бы в вызов чужого маршрута.
 */
function segment(id: string): string {
  if (!/^[\w-]{1,64}$/.test(id)) throw new StudentsServiceError("Недопустимый идентификатор");
  return encodeURIComponent(id);
}

/** Путь должен остаться тем, что мы написали: без «..», «%2e%2e», обратных слэшей и чужих префиксов. */
function assertPlainPath(path: string) {
  const raw = path.split("?")[0];
  const parsed = new URL(path, "http://x");
  const okPrefix = raw.startsWith("/api/service/") || raw.startsWith("/api/files/");
  if (!okPrefix || parsed.pathname !== raw || raw.includes("\\")) {
    throw new StudentsServiceError("Недопустимый путь служебного запроса");
  }
}

/** Клиент CRM, которого уже заводили на платформе: id → когда и с каким договором. */
const provisioned = new Map<string, { at: number; active: boolean }>();
/** Раз в это время подтверждаем статус договора, чтобы платформа не считала подписавшего лидом. */
const PROVISION_TTL_MS = 5 * 60_000;

function scopedClientId(path: string, init?: RequestInit): string | null {
  // Только кабинет клиента: у остальных служебных вызовов (заявки на привязку, справки)
  // crmClientId означает другое — например, к какому клиенту привязывают компанию
  if (!path.startsWith("/api/service/employer/")) return null;
  const fromQuery = new URL(path, "http://x").searchParams.get("crmClientId");
  if (fromQuery) return fromQuery;
  if (typeof init?.body === "string") {
    try {
      const id = (JSON.parse(init.body) as { crmClientId?: unknown }).crmClientId;
      return typeof id === "string" && id ? id : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Кого отдать платформе контактом компании. Платформа пишет на эту почту
 * (отклики студентов, решения по вакансиям) и закрепляет её за компанией
 * насовсем: повторный ensure контакт не перезаписывает. Поэтому только
 * настоящая почта — не заглушка быстрой регистрации (…@users.invalid, вход
 * по телефону): письма уходили бы в никуда, а в адресе
 * заглушки ещё и цифры номера. Нет такой почты — нет и контакта.
 */
function studentsContact<T extends { email: string; role: string }>(users: T[]): T | null {
  const reachable = users.filter((u) => isDeliverableEmail(u.email));
  return reachable.find((u) => u.role === "CLIENT_ADMIN") ?? reachable[0] ?? null;
}

/**
 * Можно ли открыть клиенту студенческий раздел: есть ли у компании
 * рабочая почта для платформы (см. studentsContact). Пока нет, раздел
 * просит подтвердить почту в настройках, а не падает на первом запросе.
 */
export async function hasStudentsContact(crmClientId: string): Promise<boolean> {
  const users = await prisma.user.findMany({
    where: { clientId: crmClientId, isActive: true },
    select: { email: true, role: true },
  });
  return studentsContact(users) !== null;
}

/**
 * Компания клиента появлялась на платформе только при его первом входе туда
 * билетом. Теперь клиент работает из CRM и туда не заходит, поэтому первый же
 * запрос за вакансиями получал 404. Перед обращением заводим компанию сами
 * (ответ идемпотентен) и заодно обновляем статус договора.
 */
async function ensureEmployer(crmClientId: string): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: crmClientId },
    select: {
      name: true,
      status: true,
      users: {
        where: { isActive: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { fullName: true, email: true, role: true },
      },
    },
  });
  if (!client) return;
  const active = client.status === "ACTIVE";
  const known = provisioned.get(crmClientId);
  if (known && known.active === active && Date.now() - known.at < PROVISION_TTL_MS) return;

  const contact = studentsContact(client.users);
  if (!contact) return;

  const response = await rawCall("/api/service/employer/ensure", {
    method: "POST",
    body: JSON.stringify({
      crmClientId,
      companyName: client.name,
      contactName: contact.fullName,
      contactEmail: contact.email,
      active,
      actor: "CRM",
    }),
  });
  if (response.ok) provisioned.set(crmClientId, { at: Date.now(), active });
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const crmClientId = scopedClientId(path, init);
  if (crmClientId && !path.startsWith("/api/service/employer/ensure")) {
    await ensureEmployer(crmClientId).catch(() => undefined);
  }
  return rawCall(path, init);
}

async function rawCall(path: string, init?: RequestInit): Promise<Response> {
  assertPlainPath(path);
  const secret = serviceSecret();
  const url = studentsUrl(path);
  if (!secret || !url) {
    throw new StudentsServiceError(
      "Служебный вызов на студенческую платформу не настроен: нужны STUDENTS_URL и CRM_SERVICE_SECRET",
    );
  }
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${secret}`,
      // Для файла тип с границей ставит сам fetch
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
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
  const response = await call(`/api/service/crm-links/${segment(employerId)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ crmClientId }),
  });
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
}

/** Отклонить заявку с пояснением — компания увидит его у себя. */
export async function rejectCrmLinkRequest(employerId: string, note: string): Promise<void> {
  const response = await call(`/api/service/crm-links/${segment(employerId)}/reject`, {
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

export interface CompanyProfileSync {
  crmClientId: string;
  actor: string;
  companyName: string;
  inn: string | null;
  about: string | null;
  website: string | null;
  city: string | null;
  /** Логотип, уже загруженный на платформу; undefined — не менять */
  logoUrl?: string | null;
}

/** Профиль компании клиента уходит на платформу: агентство видит его при проверке вакансии. */
export async function syncCompanyProfile(input: CompanyProfileSync): Promise<{ error?: string; code?: string }> {
  const response = await call("/api/service/employer/profile", { method: "PUT", body: JSON.stringify(input) });
  if (!response.ok) {
    const failure = await parseError(response);
    return { error: failure.error, code: failure.code };
  }
  return {};
}

/** Обложка вакансии — картинка компании; платформа проверяет тип и размер (JPG/PNG/WebP до 5 МБ). */
export async function uploadVacancyCover(
  crmClientId: string,
  file: File,
  actor: string,
): Promise<{ url?: string; error?: string }> {
  const body = new FormData();
  body.set("file", file);
  body.set("actor", actor);
  const response = await call(`/api/service/employer/upload?crmClientId=${encodeURIComponent(crmClientId)}`, {
    method: "POST",
    body,
  });
  if (!response.ok) return { error: (await parseError(response)).error };
  const data = (await response.json()) as { url: string };
  return { url: data.url };
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
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const response = await call(`/api/service/employer/vacancies/${segment(id)}?crmClientId=${encodeURIComponent(crmClientId)}`);
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
  const response = await call(`/api/service/employer/vacancies/${segment(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!response.ok) return { error: await parseError(response) };
  const data = (await response.json()) as { id: string; status: StudentsVacancyStatus };
  return data;
}

/** Действие: отправить на проверку/опубликовать, снять или удалить. */
export async function actOnEmployerVacancy(
  id: string,
  input: { crmClientId: string; actor: string; action: "submit" | "close" | "delete"; keep?: boolean },
): Promise<{ error?: StudentsApiError; id?: string; status?: StudentsVacancyStatus; deleted?: boolean }> {
  const response = await call(`/api/service/employer/vacancies/${segment(id)}`, { method: "POST", body: JSON.stringify(input) });
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
    studyLevel?: string | null;
    studyVerified: boolean;
    city: string | null;
    workDays: string[];
    hoursPerWeek: number | null;
    skills: string[];
    about: string | null;
    hasPhoto?: boolean;
    hasResume?: boolean;
    resumeName?: string | null;
  };
}

/** Фото или резюме студента по его отклику на вакансию клиента. Отклик чужой компании платформа не отдаёт. */
export async function fetchApplicantFile(
  crmClientId: string,
  applicationId: string,
  kind: "photo" | "resume",
  actor: string,
): Promise<Response> {
  const query = new URLSearchParams({ crmClientId, applicationId, kind, actor });
  return call(`/api/service/employer/files?${query.toString()}`);
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

/** Переписка клиента со студентами, счётчики для значков и поиск кандидатов. */

export interface StudentThreadSummary {
  applicationId: string;
  vacancyId: string;
  vacancyTitle: string;
  counterpartName: string;
  counterpartSubtitle: string;
  /** Фото собеседника (путь на платформе): есть — значит, его можно показать по отклику */
  counterpartPhotoUrl?: string | null;
  status: StudentsApplicationStatus;
  lastMessageBody: string | null;
  lastMessageAuthor: "STUDENT" | "EMPLOYER" | null;
  lastMessageAt: string | null;
  unread: number;
  canWrite: boolean;
  lockedReason: string | null;
}

export interface StudentThreadMessage {
  id: string;
  author: "STUDENT" | "EMPLOYER";
  body: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
}

export interface StudentThread extends StudentThreadSummary {
  messages: StudentThreadMessage[];
}

const enc = encodeURIComponent;

export async function fetchStudentThreads(crmClientId: string): Promise<StudentThreadSummary[]> {
  const response = await call(`/api/service/employer/messages?crmClientId=${enc(crmClientId)}`);
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return ((await response.json()) as { threads: StudentThreadSummary[] }).threads;
}

/** null — переписки нет или она чужая. */
export async function fetchStudentThread(crmClientId: string, applicationId: string): Promise<StudentThread | null> {
  const response = await call(`/api/service/employer/messages/${enc(applicationId)}?crmClientId=${enc(crmClientId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return ((await response.json()) as { thread: StudentThread }).thread;
}

export async function sendStudentMessage(input: {
  crmClientId: string;
  actor: string;
  applicationId: string;
  body: string;
}): Promise<{ error?: StudentsApiError }> {
  const { applicationId, ...rest } = input;
  const response = await call(`/api/service/employer/messages/${enc(applicationId)}`, {
    method: "POST",
    body: JSON.stringify(rest),
  });
  return response.ok ? {} : { error: await parseError(response) };
}

export async function markStudentThreadRead(crmClientId: string, applicationId: string): Promise<void> {
  await call(`/api/service/employer/messages/${enc(applicationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ crmClientId }),
  });
}

export interface StudentsFunnelRow extends FunnelActivity {
  crmClientId: string;
  companyName: string;
}

/** Активность компаний на платформе — для воронки в агентской части CRM. */
export async function fetchStudentsFunnel(): Promise<StudentsFunnelRow[]> {
  const response = await call("/api/service/employer/funnel");
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  const data = (await response.json()) as { companies: StudentsFunnelRow[] };
  return data.companies;
}

/** Значки в CRM: новые отклики и непрочитанные сообщения. Не бросает: значок не стоит ошибки страницы. */
export interface StudentsSummary {
  newApplications: number;
  unreadMessages: number;
  /** Общая активность клиента — для подсказки «подберём сами». Нет у старой версии платформы. */
  vacancies?: number;
  published?: number;
  applications?: number;
  invited?: number;
  hired?: number;
}

export async function fetchStudentsSummary(crmClientId: string): Promise<StudentsSummary | null> {
  try {
    const response = await call(`/api/service/employer/summary?crmClientId=${enc(crmClientId)}`);
    if (!response.ok) return null;
    return (await response.json()) as StudentsSummary;
  } catch {
    return null;
  }
}

export interface StudentCandidate {
  id: string;
  fullName: string;
  age: number;
  university: string;
  speciality: string;
  studyYear: number;
  studyLevel?: string | null;
  city: string | null;
  workDays: string[];
  hoursPerWeek: number | null;
  skills: string[];
  about: string | null;
}

export async function fetchStudentCandidates(
  crmClientId: string,
  vacancyId: string,
): Promise<{ vacancy: { id: string; title: string }; candidates: StudentCandidate[] } | null> {
  const response = await call(`/api/service/employer/candidates?crmClientId=${enc(crmClientId)}&vacancyId=${enc(vacancyId)}`);
  if (response.status === 404) return null;
  if (response.status === 403) {
    throw new CandidatesLockedError("Поиск студентов откроется после заключения договора с агентством");
  }
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return (await response.json()) as { vacancy: { id: string; title: string }; candidates: StudentCandidate[] };
}

export async function inviteStudentCandidate(input: {
  crmClientId: string;
  actor: string;
  vacancyId: string;
  studentId: string;
}): Promise<{ invited?: boolean; error?: StudentsApiError }> {
  const response = await call("/api/service/employer/candidates", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) return { error: await parseError(response) };
  return { invited: ((await response.json()) as { invited: boolean }).invited };
}

// ============ Раздел «Студенты» (поиск для подбора, сотрудники агентства) ============

/** Строка списка — без почты, телефона, даты рождения и ссылок на файлы: их платформа не отдаёт. */
export interface PlatformStudentItem {
  id: string;
  fullName: string;
  age: number;
  gender: "MALE" | "FEMALE" | "UNSPECIFIED";
  university: string;
  speciality: string;
  studyYear: number;
  studyLevel: string | null;
  city: string | null;
  skills: string[];
  about: string | null;
  status: "ACTIVE" | "IN_PROGRESS" | "PLACED" | "PAUSED";
  studyVerified: boolean;
  studyPending: boolean;
  paused: boolean;
  placed: boolean;
  createdAt: string;
  /** null — не появлялся или скрыл показ: платформа не различает */
  lastSeenAt: string | null;
}

export interface PlatformStudentSearch {
  items: PlatformStudentItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Подсказка вместо результатов или рядом с ними: «уточните фильтры» */
  hint: string | null;
}

export interface PlatformStudentProfile extends PlatformStudentItem {
  institutionId: string | null;
  workDays: string[];
  hoursPerWeek: number | null;
  lookingFor: string[];
  goals: string | null;
  projects: { title: string; description: string | null; link: string | null }[];
  achievements: { title: string; description: string | null; year: number | null }[];
  activities: { kind: string; title: string; description: string | null }[];
  hobbies: string | null;
  links: { label: string; url: string }[];
  videoUrl: string | null;
  hasPhoto: boolean;
  hasResume: boolean;
  resumeName: string | null;
  /** Только при contacts=1 */
  contacts: { email: string; phone: string | null } | null;
}

/** Дольше платформу не ждём: страница с поиском не должна висеть вместе с ней. */
const STAFF_TIMEOUT_MS = 10_000;

/** Платформа просит подождать: лимит запросов на сотрудника. */
export class StudentsRateLimitedError extends StudentsServiceError {}

/**
 * Служебный вызов от имени сотрудника: платформа по x-crm-actor ведёт лимит и журнал
 * просмотров анкет. Сеть и таймаут превращаются в StudentsServiceError, как и ответ с
 * ошибкой, — страницы показывают «платформа не ответила», а не падают.
 */
async function staffCall(path: string, actorId: string): Promise<Response> {
  let response: Response;
  try {
    response = await rawCall(path, {
      headers: { "x-crm-actor": actorId },
      signal: AbortSignal.timeout(STAFF_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof StudentsServiceError) throw error;
    throw new StudentsServiceError("Студенческая платформа не отвечает.");
  }
  if (response.status === 429) {
    throw new StudentsRateLimitedError("Слишком много запросов к студенческой платформе — подождите минуту.");
  }
  return response;
}

/** Страница списка студентов. Параметры уже проверены (lib/students-search-params.ts). */
export async function searchPlatformStudents(
  query: URLSearchParams,
  actorId: string,
): Promise<PlatformStudentSearch> {
  const qs = query.toString();
  const response = await staffCall(`/api/service/staff/students${qs ? `?${qs}` : ""}`, actorId);
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return (await response.json()) as PlatformStudentSearch;
}

/**
 * Профиль студента. Контакты — только при `contacts: true`: это отдельное явное действие
 * сотрудника, и вызывающий обязан записать его в журнал доступа к ПДн. null — студента нет.
 */
export async function fetchPlatformStudent(
  id: string,
  options: { actorId: string; contacts?: boolean },
): Promise<PlatformStudentProfile | null> {
  const response = await staffCall(
    `/api/service/staff/students/${segment(id)}${options.contacts ? "?contacts=1" : ""}`,
    options.actorId,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new StudentsServiceError(`Студенческая платформа ответила ${response.status}`);
  return (await response.json()) as PlatformStudentProfile;
}

/**
 * Названия вузов из справочника платформы — подсказки в фильтре. Справочник открытый, без
 * секрета; недоступен — фильтр остаётся обычным текстовым полем.
 */
export async function fetchInstitutionNames(): Promise<string[]> {
  const url = studentsUrl("/api/institutions");
  if (!url) return [];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000), next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const data = (await response.json()) as { institutions?: { name: string; shortName: string | null }[] };
    const names = new Set<string>();
    for (const item of data.institutions ?? []) {
      names.add(item.name);
      if (item.shortName) names.add(item.shortName);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ru"));
  } catch {
    return [];
  }
}
