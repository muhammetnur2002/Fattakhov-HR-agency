import { dayKeyOf, minutesOfDay, type DayKey } from "@/lib/calendar/moscow";
import type { TaskRow } from "@/lib/services/calendar-tasks";

/**
 * Данные и чистые расчёты календаря задач. Без React: раскладка дня, окно по шагу
 * масштаба и фильтр по сотруднику проверяются тестами отдельно от разметки.
 * Моменты времени ходят между сервером и браузером строками ISO.
 */

export type CalendarTaskDTO = {
  id: string;
  /** Начало вхождения по правилу серии (ISO): ключ правки одного повторения. */
  occurrence: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  hasDeadline: boolean;
  remindBeforeMinutes: number | null;
  recurrenceRule: string | null;
  recurrenceUntil: string | null;
  personal: boolean;
  completedAt: string | null;
  overdue: boolean;
  assignee: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
  vacancy: { id: string; label: string } | null;
  candidate: { id: string; fullName: string } | null;
  canEdit: boolean;
  canComplete: boolean;
};

export type CalendarInterviewDTO = {
  id: string;
  applicationId: string;
  startsAt: string;
  durationMinutes: number;
  /** Имя кандидата. */
  title: string;
  /** Вакансия и компания. */
  subtitle: string;
  participantIds: string[];
};

export type PersonFilter = "all" | "mine" | { userId: string };

export function toTaskDTO(row: TaskRow): CalendarTaskDTO {
  return {
    id: row.id,
    occurrence: row.occurrence.toISOString(),
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    hasDeadline: row.hasDeadline,
    remindBeforeMinutes: row.remindBeforeMinutes,
    recurrenceRule: row.recurrenceRule,
    recurrenceUntil: row.recurrenceUntil?.toISOString() ?? null,
    personal: row.personal,
    completedAt: row.completedAt?.toISOString() ?? null,
    overdue: row.overdue,
    assignee: row.assignee,
    createdBy: row.createdBy,
    vacancy: row.vacancy,
    candidate: row.candidate,
    canEdit: row.canEdit,
    canComplete: row.canComplete,
  };
}

/** Стабильный ключ вхождения для списков React. */
export function taskKey(task: Pick<CalendarTaskDTO, "id" | "occurrence">): string {
  return `${task.id}@${task.occurrence}`;
}

/** Фильтр «Все / Мои / сотрудник». «Мои» и сотрудник — по исполнителю; у интервью — по участнику. */
export function matchesPerson(
  filter: PersonFilter,
  currentUserId: string,
  assigneeOrParticipants: string | string[],
): boolean {
  if (filter === "all") return true;
  const target = filter === "mine" ? currentUserId : filter.userId;
  return Array.isArray(assigneeOrParticipants)
    ? assigneeOrParticipants.includes(target)
    : assigneeOrParticipants === target;
}

/** Значение <select> фильтра → фильтр. */
export function parsePersonFilter(value: string): PersonFilter {
  if (value === "all" || value === "mine") return value;
  return value.startsWith("user:") ? { userId: value.slice(5) } : "all";
}

export function personFilterValue(filter: PersonFilter): string {
  return typeof filter === "string" ? filter : `user:${filter.userId}`;
}

/** Группировка по дню (московскому) начала. */
export function groupByDay<T extends { startsAt: string }>(items: T[]): Map<DayKey, T[]> {
  const map = new Map<DayKey, T[]>();
  for (const item of items) {
    const key = dayKeyOf(new Date(item.startsAt));
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return map;
}

// ---- Режим «День» ----

/** Шаги масштаба в минутах, от крупного к мелкому (положение ползунка = индекс). */
export const DAY_STEPS = [60, 30, 15, 5] as const;
export type DayStep = (typeof DAY_STEPS)[number];

/** Высота строки слота в пикселях: чем мельче шаг, тем плотнее строка. */
export const SLOT_HEIGHT: Record<DayStep, number> = { 60: 56, 30: 44, 15: 36, 5: 30 };

/** Сколько минут видно: на шагах 60 и 30 — сутки, на 15 — 4 часа, на 5 — 2 часа. */
export const WINDOW_MINUTES: Record<DayStep, number> = { 60: 1440, 30: 1440, 15: 240, 5: 120 };

/**
 * Окно видимых минут вокруг «фокусного» времени (текущее или рабочее утро).
 * Начало выровнено по шагу и прижато к границам суток.
 */
export function windowFor(step: DayStep, focusMinutes: number): { start: number; end: number } {
  const size = WINDOW_MINUTES[step];
  if (size >= 1440) return { start: 0, end: 1440 };
  const raw = focusMinutes - size / 2;
  const aligned = Math.floor(raw / step) * step;
  const start = Math.min(Math.max(aligned, 0), 1440 - size);
  return { start, end: start + size };
}

export type DayItem = { key: string; startMin: number; endMin: number };
export type DayPlacement = { col: number; cols: number };

/**
 * Раскладка пересекающихся блоков по колонкам: блоки, которые идут одновременно,
 * делят ширину поровну; не пересекающиеся занимают всю ширину.
 */
export function layoutDay(items: DayItem[]): Map<string, DayPlacement> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result = new Map<string, DayPlacement>();

  let cluster: { item: DayItem; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = cluster.reduce((max, c) => Math.max(max, c.col + 1), 1);
    for (const c of cluster) result.set(c.item.key, { col: c.col, cols });
    cluster = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    if (cluster.length === 0) clusterEnd = -1;
    // Первая колонка, где предыдущий блок уже закончился
    const busy = new Set(cluster.filter((c) => c.item.endMin > item.startMin).map((c) => c.col));
    let col = 0;
    while (busy.has(col)) col++;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return result;
}

/** Интервал блока в минутах от московской полуночи дня `day`, обрезанный до границ суток. */
export function minutesRange(startsAt: Date, durationMinutes: number, day: DayKey): { startMin: number; endMin: number } | null {
  if (dayKeyOf(startsAt) !== day) return null;
  const startMin = minutesOfDay(startsAt);
  return { startMin, endMin: Math.min(1440, startMin + Math.max(durationMinutes, 5)) };
}
