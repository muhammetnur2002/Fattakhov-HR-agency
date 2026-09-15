/**
 * Стейт-машина вакансии (ТЗ 6.1).
 *
 * Чистый модуль без обращения к БД — правила переходов должны быть
 * проверяемы отдельно от того, как они вызываются. Само выполнение
 * перехода со всеми побочными эффектами живёт в services/vacancies.ts.
 */
import type { VacancyStatus } from "@/lib/generated/prisma/enums";

/**
 * Куда можно перейти из каждого статуса.
 * Всё, чего здесь нет, запрещено — список закрытый намеренно.
 */
export const ALLOWED_TRANSITIONS: Record<VacancyStatus, VacancyStatus[]> = {
  DRAFT: ["SUBMITTED"],

  // Агентство либо задаёт вопросы, либо оценивает сроки, либо берёт сразу
  SUBMITTED: ["CLARIFYING", "ESTIMATED", "ACTIVE", "CLOSED_CANCELLED"],

  // Клиент ответил на вопросы — заявка возвращается на рассмотрение
  CLARIFYING: ["SUBMITTED", "CLOSED_CANCELLED"],

  // Клиент подтверждает предложенные сроки
  ESTIMATED: ["ACTIVE", "CLARIFYING", "CLOSED_CANCELLED"],

  ACTIVE: ["ON_HOLD", "CLOSED_SUCCESS", "CLOSED_CANCELLED", "CLOSED_FAILED"],

  ON_HOLD: ["ACTIVE", "CLOSED_CANCELLED", "CLOSED_FAILED"],

  // Реактивация закрытой вакансии — только OWNER/HEAD, проверяется в сервисе
  CLOSED_SUCCESS: ["ACTIVE"],
  CLOSED_CANCELLED: ["ACTIVE"],
  CLOSED_FAILED: ["ACTIVE"],
};

export function canTransition(from: VacancyStatus, to: VacancyStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Статусы, из которых вакансия считается закрытой. */
export const CLOSED_STATUSES: VacancyStatus[] = [
  "CLOSED_SUCCESS",
  "CLOSED_CANCELLED",
  "CLOSED_FAILED",
];

export function isClosed(status: VacancyStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

/** Вакансия в работе: по ней можно вести воронку. */
export function isRunning(status: VacancyStatus): boolean {
  return status === "ACTIVE";
}

/**
 * Реактивация закрытой вакансии — не рядовое действие: она возвращает
 * в работу то, за что уже могли выставить счёт. Доступна только руководству.
 */
export function isReactivation(
  from: VacancyStatus,
  to: VacancyStatus,
): boolean {
  return isClosed(from) && to === "ACTIVE";
}

/**
 * BR-21: клиент правит бриф свободно, только пока заявка не в работе.
 * Дальше — через «запросить изменение», иначе рекрутер ищет по одним
 * требованиям, а оценивают его по другим.
 */
export function clientCanEditBrief(status: VacancyStatus): boolean {
  return status === "DRAFT" || status === "SUBMITTED" || status === "CLARIFYING";
}

/** Причина закрытия обязательна, когда вакансия закрывается не наймом. */
export function requiresCloseReason(to: VacancyStatus): boolean {
  return to === "CLOSED_CANCELLED" || to === "CLOSED_FAILED";
}

export class VacancyTransitionError extends Error {}
