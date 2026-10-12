/**
 * Календарные даты и время по Москве.
 *
 * Календарь агентства живёт в одном поясе, Europe/Moscow (Казань в том же): сервер и
 * браузер могут стоять где угодно, и «день» не должен зависеть от того, где посчитали.
 * С 2014 года в России нет перехода на летнее время, смещение постоянно (+03:00), поэтому
 * день и час считаются арифметикой над миллисекундами, без Intl на каждую ячейку сетки.
 * Если пояс когда-нибудь снова начнёт переходить, менять нужно только этот файл
 * (тест tests/calendar-grid.test.ts сверяет его с Intl).
 *
 * «Ключ дня» — строка 2026-10-12: календарная дата по Москве. Дни листаются
 * арифметикой над ключами, а не над Date в местном поясе.
 */

export const CALENDAR_TIME_ZONE = "Europe/Moscow";

const MSK_OFFSET_MS = 3 * 3_600_000;
export const DAY_MS = 86_400_000;

export type DayKey = string;

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Московское «настенное» время как UTC-поля: удобно брать год, месяц, день недели. */
function mskWall(date: Date): Date {
  return new Date(date.getTime() + MSK_OFFSET_MS);
}

/** Ключ дня (по Москве), в который попадает момент. */
export function dayKeyOf(date: Date): DayKey {
  const w = mskWall(date);
  return keyFromUtcParts(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
}

function keyFromUtcParts(y: number, m0: number, d: number): DayKey {
  const date = new Date(Date.UTC(y, m0, d));
  const yy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Разбор ключа: только настоящая календарная дата, иначе null. */
export function parseDayKey(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = value?.match(KEY_RE);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
    ? { y, m, d }
    : null;
}

export function isDayKey(value: string | null | undefined): value is DayKey {
  return parseDayKey(value) !== null;
}

/** Момент московской полуночи этого дня. */
export function startOfDay(key: DayKey): Date {
  const p = parseDayKey(key);
  if (!p) throw new Error(`Некорректная дата: ${key}`);
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - MSK_OFFSET_MS);
}

/** Сдвиг ключа на целое число дней (в том числе отрицательное). */
export function addDays(key: DayKey, days: number): DayKey {
  const p = parseDayKey(key);
  if (!p) throw new Error(`Некорректная дата: ${key}`);
  return keyFromUtcParts(p.y, p.m - 1, p.d + days);
}

/** Сдвиг на месяцы с прижатием к последнему дню месяца: 31 янв + 1 = 28 фев. */
export function addMonths(key: DayKey, months: number): DayKey {
  const p = parseDayKey(key);
  if (!p) throw new Error(`Некорректная дата: ${key}`);
  const firstOfTarget = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return keyFromUtcParts(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(p.d, lastDay));
}

/** Сколько дней от a до b (b позже: положительное). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/** День недели: 0 — понедельник … 6 — воскресенье (так начинается неделя в РФ). */
export function weekdayOf(key: DayKey): number {
  const p = parseDayKey(key);
  if (!p) throw new Error(`Некорректная дата: ${key}`);
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

export function isSaturday(key: DayKey): boolean {
  return weekdayOf(key) === 5;
}

export function isSunday(key: DayKey): boolean {
  return weekdayOf(key) === 6;
}

/** Число дня месяца (1–31). */
export function dayOfMonth(key: DayKey): number {
  return parseDayKey(key)!.d;
}

/** Ключ первого дня месяца. */
export function monthStart(key: DayKey): DayKey {
  const p = parseDayKey(key)!;
  return keyFromUtcParts(p.y, p.m - 1, 1);
}

/** Ключ первого дня недели (понедельника), в которую попадает день. */
export function weekStart(key: DayKey): DayKey {
  return addDays(key, -weekdayOf(key));
}

/** Минуты от московской полуночи (0–1439). */
export function minutesOfDay(date: Date): number {
  const w = mskWall(date);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

/** Момент: день и минуты от его московской полуночи. */
export function atMinutes(key: DayKey, minutes: number): Date {
  return new Date(startOfDay(key).getTime() + minutes * 60_000);
}

/** Значение для поля datetime-local в московском времени: 2026-10-12T14:30. */
export function toMoscowInput(date: Date): string {
  const w = mskWall(date).toISOString();
  return w.slice(0, 16);
}

/** Значение поля datetime-local (московское) → момент; невалидное → Invalid Date. */
export function fromMoscowInput(value: string): Date {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!m || !parseDayKey(m[1])) return new Date(NaN);
  const [h, min] = [Number(m[2]), Number(m[3])];
  if (h > 23 || min > 59) return new Date(NaN);
  return atMinutes(m[1], h * 60 + min);
}

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const WEEKDAYS_LONG = [
  "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье",
];

export function monthName(key: DayKey): string {
  return MONTHS[parseDayKey(key)!.m - 1];
}

/** «Октябрь 2026». */
export function monthTitle(key: DayKey): string {
  const p = parseDayKey(key)!;
  const name = MONTHS[p.m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${p.y}`;
}

/** «понедельник, 12 октября». */
export function dayTitle(key: DayKey): string {
  const p = parseDayKey(key)!;
  return `${WEEKDAYS_LONG[weekdayOf(key)]}, ${p.d} ${MONTHS_GENITIVE[p.m - 1]}`;
}

/** «14:30» по Москве. */
export function timeLabel(date: Date): string {
  const m = minutesOfDay(date);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** «12 октября» по Москве. */
export function dateLabel(date: Date): string {
  const p = parseDayKey(dayKeyOf(date))!;
  return `${p.d} ${MONTHS_GENITIVE[p.m - 1]}`;
}

/** «12 октября, 14:30» по Москве. */
export function dateTimeLabel(date: Date): string {
  const p = parseDayKey(dayKeyOf(date))!;
  return `${p.d} ${MONTHS_GENITIVE[p.m - 1]}, ${timeLabel(date)}`;
}

/** Год ключа. */
export function yearOf(key: DayKey): number {
  return parseDayKey(key)!.y;
}

/** Месяц ключа, 0–11. */
export function monthIndexOf(key: DayKey): number {
  return parseDayKey(key)!.m - 1;
}

/** Сетка месяца: недели по 7 ключей, с понедельника, с хвостами соседних месяцев. */
export function monthGrid(key: DayKey): DayKey[][] {
  const first = monthStart(key);
  const start = weekStart(first);
  const next = addMonths(first, 1);
  const weeks: DayKey[][] = [];
  for (let cursor = start; cursor < next || weeks.length === 0; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
  }
  return weeks;
}
