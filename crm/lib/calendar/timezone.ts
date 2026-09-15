/**
 * Перевод «настенного» времени в момент времени.
 *
 * Рекрутер вводит «12 августа, 10:00» и выбирает зону. Сервер может
 * стоять в любой зоне, поэтому считать через локальное время процесса
 * нельзя — встреча уедет на часы.
 */

/**
 * `2026-08-12T10:00` в зоне `timeZone` → соответствующий момент в UTC.
 *
 * Смещение зоны берётся на конкретную дату через Intl, а не константой:
 * иначе переход на летнее время (в РФ его нет, но клиенты бывают
 * и за границей) сдвинет встречу на час.
 */
/**
 * Формат `datetime-local`. Проверяем строку явно, потому что парсер Date
 * слишком снисходителен: `new Date("не дата:00Z")` возвращает не ошибку,
 * а 1 января 2000 года — и слот молча уезжает в прошлое.
 */
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function zonedToUtc(local: string, timeZone: string): Date {
  if (!LOCAL_DATETIME.test(local)) return new Date(NaN);

  const asUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return new Date(NaN);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(asUtc).map((p) => [p.type, p.value]),
  );

  // Отформатировав «время как UTC» в целевой зоне, получаем L + смещение.
  // Нужен же момент L − смещение, то есть 2L − (L + смещение).
  const shifted = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return new Date(asUtc.getTime() * 2 - shifted);
}

/** Момент времени → строка для `datetime-local` в нужной зоне. */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );

  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
