import { canDo, type Actor } from "@/lib/access";
import type { CalendarEvent } from "@/lib/calendar/ical";
import { dayKeyOf, dayOfMonth, DAY_MS, startOfDay } from "@/lib/calendar/moscow";
import { parseRule, WEEKDAY_CODES } from "@/lib/calendar/recurrence";
import { prisma } from "@/lib/db/prisma";
import { appOrigin } from "@/lib/urls";

/**
 * Задачи в iCal-фиде.
 *
 * В личный фид попадают только задачи, где человек исполнитель: свои личные и
 * поставленные ему. Те, что он поставил другим, и «общие» задачи для руководителей
 * сюда не идут — каждый видит в телефоне только своё (решение владельца).
 */

type FeedTask = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  durationMinutes: number;
  hasDeadline: boolean;
  remindBeforeMinutes: number | null;
  recurrenceRule: string | null;
  recurrenceUntil: Date | null;
  completedAt: Date | null;
  isPersonal: boolean;
  createdById: string;
  exceptions: {
    occurrenceDate: Date;
    cancelled: boolean;
    movedToStartsAt: Date | null;
  }[];
};

/** Правило задачи → RRULE (без префикса). null: правило не распознано, повтор пропускаем. */
export function toRRule(task: Pick<FeedTask, "dueAt" | "recurrenceRule" | "recurrenceUntil">): string | null {
  const rule = parseRule(task.recurrenceRule);
  if (!rule) return null;
  const parts: string[] = [];
  if (rule.freq === "DAILY") parts.push("FREQ=DAILY");
  else if (rule.freq === "WEEKLY") {
    const days = rule.days.length ? rule.days : [];
    parts.push("FREQ=WEEKLY", `BYDAY=${days.map((d) => WEEKDAY_CODES[d]).join(",")}`);
  } else {
    parts.push("FREQ=MONTHLY", `BYMONTHDAY=${dayOfMonth(dayKeyOf(task.dueAt))}`);
  }
  if (task.recurrenceUntil) {
    // Последний день включительно, конец московского дня; UNTIL при TZID задаётся в UTC
    const end = new Date(startOfDay(dayKeyOf(task.recurrenceUntil)).getTime() + DAY_MS - 1000);
    parts.push(`UNTIL=${end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
  }
  return parts.join(";");
}

/** События для фида из задач (чистая функция, без обращения к базе). */
export function taskFeedEvents(
  tasks: FeedTask[],
  creatorNames: Map<string, string>,
  baseUrl: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const task of tasks) {
    const rrule = toRRule(task);
    const recurring = Boolean(task.recurrenceRule) && rrule !== null;
    const description = [
      task.description,
      task.isPersonal ? null : `Поставил(а): ${creatorNames.get(task.createdById) ?? "сотрудник"}`,
      `Календарь: ${baseUrl}/a/calendar?view=day&date=${dayKeyOf(task.dueAt)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const base = {
      uid: `task-${task.id}@hr-platform`,
      startsAt: task.dueAt,
      durationMinutes: task.durationMinutes,
      summary: `${task.completedAt && !recurring ? "✓ " : ""}${task.title}`,
      description,
      url: `${baseUrl}/a/calendar?view=day&date=${dayKeyOf(task.dueAt)}`,
      ...(task.hasDeadline && task.remindBeforeMinutes !== null
        ? { alarmMinutes: task.remindBeforeMinutes }
        : {}),
    };

    if (!recurring) {
      events.push(base);
      continue;
    }

    events.push({
      ...base,
      rrule: rrule!,
      // Отменённые и перенесённые вхождения исключаются из серии; перенесённые идут отдельными событиями
      exdates: task.exceptions
        .filter((e) => e.cancelled || e.movedToStartsAt)
        .map((e) => e.occurrenceDate),
    });
    for (const e of task.exceptions) {
      if (e.cancelled || !e.movedToStartsAt) continue;
      events.push({ ...base, startsAt: e.movedToStartsAt, recurrenceId: e.occurrenceDate });
    }
  }
  return events;
}

/**
 * Задачи человека для его iCal-фида. Клиентские роли и роли без права на календарь
 * задач получают пустой список.
 */
export async function loadTaskFeedEvents(actor: Actor, from: Date, to: Date): Promise<CalendarEvent[]> {
  if (!canDo(actor, "task.manage")) return [];

  const tasks = await prisma.calendarTask.findMany({
    where: {
      organizationId: actor.organizationId,
      assigneeId: actor.id,
      OR: [
        { recurrenceRule: null, dueAt: { gte: from, lte: to } },
        {
          recurrenceRule: { not: null },
          dueAt: { lte: to },
          OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: from } }],
        },
      ],
    },
    include: { exceptions: true },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  if (tasks.length === 0) return [];

  const creatorIds = [...new Set(tasks.filter((t) => !t.isPersonal).map((t) => t.createdById))];
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, fullName: true } })
    : [];

  return taskFeedEvents(tasks, new Map(creators.map((u) => [u.id, u.fullName])), appOrigin());
}
