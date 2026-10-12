import {
  addDays,
  dayKeyOf,
  dayOfMonth,
  DAY_MS,
  diffDays,
  weekdayOf,
} from "@/lib/calendar/moscow";

/**
 * Повторяющиеся задачи.
 *
 * Правило хранится строкой: DAILY, WEEKLY:MO,WE,FR или MONTHLY (дни недели —
 * двухбуквенные коды RFC 5545, их же понимает RRULE в .ics). Вхождения не хранятся:
 * они разворачиваются на сервере только в запрошенном диапазоне, а отмена и перенос
 * одного вхождения лежат в CalendarTaskException. Время суток у всех вхождений то же,
 * что у первого (в Москве нет перехода на летнее время, поэтому это ровно N суток).
 */

export type Recurrence =
  | { freq: "DAILY" }
  | { freq: "WEEKLY"; days: number[] }
  | { freq: "MONTHLY" };

/** Коды дней недели в порядке понедельник … воскресенье. */
export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** Разворачиваем не дальше чем на столько вхождений и суток: защита от огромного диапазона. */
const MAX_OCCURRENCES = 1000;
const MAX_RANGE_DAYS = 800;

/** Разбор правила; null, если строка не наше правило. */
export function parseRule(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;
  if (rule === "DAILY") return { freq: "DAILY" };
  if (rule === "MONTHLY") return { freq: "MONTHLY" };
  const weekly = rule.match(/^WEEKLY:((?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR|SA|SU))*)$/);
  if (weekly) {
    const days = [
      ...new Set(weekly[1].split(",").map((code) => WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]))),
    ].sort((a, b) => a - b);
    return { freq: "WEEKLY", days };
  }
  return null;
}

/** Запись правила в каноническом виде (дни по порядку недели, без повторов). */
export function formatRule(rule: Recurrence): string {
  if (rule.freq === "WEEKLY") {
    return `WEEKLY:${[...new Set(rule.days)].sort((a, b) => a - b).map((d) => WEEKDAY_CODES[d]).join(",")}`;
  }
  return rule.freq;
}

/** Словами, для подписи в карточке задачи. */
export function describeRule(rule: string | null | undefined): string | null {
  const parsed = parseRule(rule);
  if (!parsed) return null;
  if (parsed.freq === "DAILY") return "каждый день";
  if (parsed.freq === "MONTHLY") return "каждый месяц";
  const names = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  return `каждую неделю: ${parsed.days.map((d) => names[d]).join(" ")}`;
}

export type RecurringTask = {
  /** Начало первого вхождения. */
  startsAt: Date;
  recurrenceRule: string | null;
  /** Последний день повторов включительно; null: без конца. */
  recurrenceUntil: Date | null;
};

export type TaskExceptionRow = {
  occurrenceDate: Date;
  cancelled: boolean;
  movedToStartsAt: Date | null;
  completedAt: Date | null;
};

export type Occurrence = {
  /** Начало вхождения по правилу серии: ключ исключения. */
  occurrenceDate: Date;
  /** Фактическое начало (с учётом переноса). */
  startsAt: Date;
  completedAt: Date | null;
};

/** Сдвиг начала задачи на целое число суток. */
function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Дни серии (по правилу, без исключений), чьё начало попадает в [from, to).
 *
 * Отдельная функция, потому что день вхождения и его момент связаны только временем
 * суток: перебираем дни, а момент собираем из даты и времени первого вхождения.
 */
function ruleStarts(task: RecurringTask, rule: Recurrence, from: Date, to: Date): Date[] {
  const first = task.startsAt;
  const firstDay = dayKeyOf(first);
  const untilDay = task.recurrenceUntil ? dayKeyOf(task.recurrenceUntil) : null;

  // Окно перебора в днях от первого вхождения. Вхождение, начавшееся до `from`, но ещё
  // идущее, считает вызывающий: он расширяет `from` на длительность
  let startDay = dayKeyOf(from);
  if (startDay < firstDay) startDay = firstDay;
  const lastInclusive = dayKeyOf(new Date(to.getTime() - 1));
  let endDay = lastInclusive;
  if (untilDay && untilDay < endDay) endDay = untilDay;
  if (endDay < startDay) return [];
  if (diffDays(startDay, endDay) > MAX_RANGE_DAYS) {
    endDay = addDays(startDay, MAX_RANGE_DAYS);
  }

  const result: Date[] = [];
  const firstWeekday = weekdayOf(firstDay);
  const firstDom = dayOfMonth(firstDay);

  for (let day = startDay; day <= endDay && result.length < MAX_OCCURRENCES; day = addDays(day, 1)) {
    let hit = false;
    if (rule.freq === "DAILY") hit = true;
    else if (rule.freq === "WEEKLY") hit = (rule.days.length ? rule.days : [firstWeekday]).includes(weekdayOf(day));
    // Тридцать первого числа в коротком месяце вхождения нет, как в RRULE FREQ=MONTHLY
    else hit = dayOfMonth(day) === firstDom;
    if (!hit) continue;

    const at = shiftDays(first, diffDays(firstDay, day));
    if (at.getTime() >= from.getTime() && at.getTime() < to.getTime()) result.push(at);
  }
  return result;
}

/**
 * Вхождения задачи, начинающиеся в [from, to): с переносами, без отменённых.
 *
 * Не повторяющаяся задача — одно «вхождение» со своим началом. Перенесённое вхождение
 * попадает в диапазон по новому времени, а не по старому.
 */
export function expandOccurrences(
  task: RecurringTask & { completedAt?: Date | null },
  from: Date,
  to: Date,
  exceptions: readonly TaskExceptionRow[] = [],
): Occurrence[] {
  const rule = parseRule(task.recurrenceRule);
  if (!rule) {
    const t = task.startsAt.getTime();
    return t >= from.getTime() && t < to.getTime()
      ? [{ occurrenceDate: task.startsAt, startsAt: task.startsAt, completedAt: task.completedAt ?? null }]
      : [];
  }

  const byDate = new Map(exceptions.map((e) => [e.occurrenceDate.getTime(), e]));
  const result: Occurrence[] = [];

  // Перенесённые вхождения могут лежать в диапазоне, хотя по правилу попадают вне его:
  // берём шире (на месяц в обе стороны) и фильтруем уже по фактическому началу
  const wideFrom = new Date(from.getTime() - 31 * DAY_MS);
  const wideTo = new Date(to.getTime() + 31 * DAY_MS);
  const moved = exceptions.filter((e) => e.movedToStartsAt && !e.cancelled);
  const candidates = ruleStarts(task, rule, moved.length ? wideFrom : from, moved.length ? wideTo : to);

  for (const original of candidates) {
    const ex = byDate.get(original.getTime());
    if (ex?.cancelled) continue;
    const at = ex?.movedToStartsAt ?? original;
    if (at.getTime() < from.getTime() || at.getTime() >= to.getTime()) continue;
    result.push({ occurrenceDate: original, startsAt: at, completedAt: ex?.completedAt ?? null });
  }
  return result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Принадлежит ли момент серии (совпадает ли с одним из вхождений по правилу). */
export function isOccurrenceOf(task: RecurringTask, at: Date): boolean {
  const rule = parseRule(task.recurrenceRule);
  if (!rule) return at.getTime() === task.startsAt.getTime();
  return ruleStarts(task, rule, at, new Date(at.getTime() + 1)).length === 1;
}
