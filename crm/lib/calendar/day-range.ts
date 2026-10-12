/**
 * Режим «День» в календаре агентства: выбранная дата в адресе.
 *
 * Дата идёт в адресе вида 2026-10-11 и читается в тех же местных часах,
 * что и границы дня на странице календаря (полночь сервера): так «день»
 * совпадает с неделей и месяцем рядом, а не живёт в другом часовом поясе.
 */

/** Дата для адреса: год-месяц-день по местному времени. */
export function toDateParam(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Разбор ?date=…: только настоящая календарная дата.
 * Любая другая строка (в том числе 2026-02-31) — null, и страница
 * показывает сегодняшний день.
 */
export function parseDateParam(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
    ? date
    : null;
}
