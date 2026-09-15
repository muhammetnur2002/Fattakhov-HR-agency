/**
 * Рабочие часы (BR-9).
 *
 * SLA считается в рабочих часах, а не календарных. Кандидат,
 * представленный в пятницу вечером, не должен числиться просроченным
 * в понедельник утром — клиент физически не мог отреагировать.
 *
 * Чистые функции без БД: правило проверяемо отдельно от того, где оно
 * применяется.
 */

/** Рабочий день по умолчанию (ТЗ 9, настройки организации). */
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 19;
/** Понедельник–пятница. */
export const WORK_DAYS = [1, 2, 3, 4, 5];

export function isWorkday(date: Date): boolean {
  return WORK_DAYS.includes(date.getDay());
}

/**
 * Сколько рабочих часов прошло между двумя моментами.
 *
 * Считаем по получасам: точность до минуты здесь избыточна, а перебор
 * по часам даёт заметную ошибку на коротких интервалах.
 */
export function businessHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0;

  const STEP_MINUTES = 30;
  let hours = 0;
  const cursor = new Date(from);

  // Ограничиваем перебор: смысла считать больше 90 дней нет,
  // а зацикливаться на битых датах — тем более
  const limit = new Date(from.getTime() + 90 * 24 * 3_600_000);
  const end = to < limit ? to : limit;

  while (cursor < end) {
    if (isWorkday(cursor)) {
      const hour = cursor.getHours() + cursor.getMinutes() / 60;
      if (hour >= WORK_START_HOUR && hour < WORK_END_HOUR) {
        hours += STEP_MINUTES / 60;
      }
    }
    cursor.setMinutes(cursor.getMinutes() + STEP_MINUTES);
  }

  return hours;
}

/** Просрочен ли норматив этапа. */
export function isOverdueBySla(
  since: Date,
  slaHours: number | null,
  now: Date = new Date(),
): boolean {
  if (!slaHours) return false;
  return businessHoursBetween(since, now) >= slaHours;
}
