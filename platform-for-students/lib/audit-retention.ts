/**
 * Сколько хранится журнал аудита и что в нём остаётся после удаления профиля.
 * Без зависимостей: константы нужны и хранилищам, и ночной задаче, и проверкам.
 */

/** Срок хранения записей журнала. Старше — удаляет ночная задача (lib/notify.ts, runNotificationJobs). */
export const AUDIT_RETENTION_MONTHS = 12;

/** Подпись актора в записях удалённого профиля: имя и идентификатор стёрты вместе с профилем. */
export const DELETED_ACTOR_LABEL = 'DELETED';

/**
 * Граница срока: записи раньше неё подлежат удалению. Месяцы календарные, не «30 дней»;
 * 29 февраля уходит на 28-е, а не на 1 марта.
 */
export function auditCutoff(now: Date = new Date()): Date {
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - AUDIT_RETENTION_MONTHS;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}
