import type {
  AgreementStatus,
  ApplicationOutcome,
  CandidateStatus,
  ClientStatus,
  InterviewStatus,
  InvoiceStatus,
  LeadStatus,
  VacancyStatus,
} from "@/lib/generated/prisma/enums";
import type { StudentsApplicationStatus, StudentsVacancyStatus } from "@/lib/students-service";

/**
 * Один словарь цветов статусов на весь кабинет.
 *
 * Раньше у каждого списка была своя карта «статус → вид бейджа» (восемь копий), и красный значил
 * то «отказ», то «ждёт вашей реакции», то «активный», то «срок горит». Теперь у статуса пять
 * смыслов, и цвет следует за смыслом, а не за списком:
 *
 * - `success`  — хорошо закончилось или подтверждено: оплачен, нанят, договор действует;
 * - `progress` — идёт, работа продолжается: в работе, выставлен, собеседование;
 * - `warning`  — ждёт реакции человека: уточняем детали, ждём подтверждения, новая заявка;
 * - `danger`   — только отказ, ошибка или просрочка: отказ, просрочен счёт, срок уничтожения вышел;
 * - `neutral`  — спокойное состояние без хода: черновик, пауза, закрыто, архив.
 *
 * Красный — не «важно» и не «горит». Срочность вакансии бейджем не показывается вовсе, активный —
 * зелёный или синий. Нужен новый статус — впиши его в карту здесь; бейдж берёт тон отсюда
 * (`components/ui/status-badge.tsx`), правило держит `tests/status-badge-rule.test.ts`.
 */
export type StatusTone = "success" | "progress" | "warning" | "danger" | "neutral";

export const VACANCY_STATUS_TONE: Record<VacancyStatus, StatusTone> = {
  DRAFT: "neutral",
  /** Ход агентства: клиент ничего не должен, пока заявку изучают. */
  SUBMITTED: "progress",
  /** Агентство задало вопросы — ответа ждут от клиента. */
  CLARIFYING: "warning",
  /** Агентство прислало сроки — ждёт подтверждения клиента. */
  ESTIMATED: "warning",
  ACTIVE: "progress",
  ON_HOLD: "neutral",
  CLOSED_SUCCESS: "success",
  CLOSED_CANCELLED: "neutral",
  CLOSED_FAILED: "neutral",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  DRAFT: "neutral",
  ISSUED: "progress",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "neutral",
};

export const CANDIDATE_STATUS_TONE: Record<CandidateStatus, StatusTone> = {
  NEW: "progress",
  IN_PROGRESS: "progress",
  WAITING_CLIENT: "warning",
  RESERVE: "neutral",
  ON_HOLD: "neutral",
  HIRED: "success",
  NOT_RELEVANT: "neutral",
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, StatusTone> = {
  LEAD: "progress",
  ACTIVE: "success",
  PAUSED: "neutral",
  ARCHIVED: "neutral",
};

export const AGREEMENT_STATUS_TONE: Record<AgreementStatus, StatusTone> = {
  /** Клиент выбрал условия, агентство не подтвердило: задача аккаунт-менеджеру. */
  PENDING: "warning",
  ACTIVE: "success",
  EXPIRED: "neutral",
  TERMINATED: "neutral",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, StatusTone> = {
  NEW: "warning",
  IN_PROGRESS: "progress",
  CONVERTED: "success",
  REJECTED: "danger",
  SPAM: "neutral",
};

export const INTERVIEW_STATUS_TONE: Record<InterviewStatus, StatusTone> = {
  /** Рекрутеру нужно предложить время. */
  SLOTS_REQUESTED: "warning",
  SLOTS_PROPOSED: "progress",
  CONFIRMED: "success",
  RESCHEDULE_REQUESTED: "warning",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

export const APPLICATION_OUTCOME_TONE: Record<ApplicationOutcome, StatusTone> = {
  IN_PROGRESS: "progress",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  ON_HOLD: "neutral",
};

/** Вакансия клиента на студенческой платформе (смотрит клиент). */
export const STUDENTS_VACANCY_STATUS_TONE: Record<StudentsVacancyStatus, StatusTone> = {
  DRAFT: "neutral",
  /** Проверяет агентство, клиенту делать нечего. */
  PENDING: "progress",
  PUBLISHED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

/** Отклик студента на вакансию (смотрит работодатель). */
export const STUDENTS_APPLICATION_STATUS_TONE: Record<StudentsApplicationStatus, StatusTone> = {
  /** Новый отклик ждёт реакции работодателя. */
  NEW: "warning",
  VIEWED: "neutral",
  INVITED: "progress",
  INTERVIEW: "progress",
  HIRED: "success",
  REJECTED: "danger",
};

/** Профиль компании на студенческой платформе (смотрит агентство). */
export type ProfileModerationStatus = "APPROVED" | "PENDING" | "REJECTED";

export const PROFILE_MODERATION_TONE: Record<ProfileModerationStatus, StatusTone> = {
  APPROVED: "success",
  PENDING: "progress",
  REJECTED: "danger",
};

/**
 * Срок, который идёт к концу: пока время есть — спокойно, за три дня — «ждёт реакции»,
 * вышел — просрочка, единственный случай красного. `daysLeft` — оставшиеся дни (≤ 0 — вышел).
 */
export function deadlineTone(daysLeft: number, soonDays = 3): StatusTone {
  if (daysLeft <= 0) return "danger";
  return daysLeft <= soonDays ? "warning" : "neutral";
}
