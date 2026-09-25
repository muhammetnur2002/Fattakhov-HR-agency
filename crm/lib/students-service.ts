import "server-only";

import { studentsUrl } from "@/lib/urls";

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

function serviceSecret(): string | null {
  const raw = process.env.CRM_SERVICE_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

class StudentsServiceError extends Error {}

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
