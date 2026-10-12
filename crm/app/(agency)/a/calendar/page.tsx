import Link from "next/link";

import { CalendarSubscription } from "@/components/interviews/calendar-subscription";
import { TasksPanel } from "@/components/calendar/tasks-panel";
import { CalendarView } from "@/components/interviews/calendar-view";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { canDo, visibleVacanciesFilter } from "@/lib/access";
import { getUserTimeZone, requireAgencyActor } from "@/lib/auth/session";
import { formatDayTitle, parseDateParam, toDateParam } from "@/lib/calendar/day-range";
import { calendarFeedUrl } from "@/lib/calendar/feed";
import { zonedToUtc } from "@/lib/calendar/timezone";
import { prisma } from "@/lib/db/prisma";
import { listAssignableUsers, listTasks } from "@/lib/services/calendar-tasks";
import {
  listInterviews,
  listUnratedInterviews,
} from "@/lib/services/interviews";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Календарь" };

/**
 * Сколько дней показывать. Неделя по умолчанию — это рабочий горизонт.
 * «День» стоит последним: кнопки идут в порядке ключей, и он оказывается
 * справа от «Квартала».
 */
const RANGES = { week: 7, month: 30, quarter: 90, day: 1 } as const;
type RangeKey = keyof typeof RANGES;

const RANGE_LABELS: Record<RangeKey, string> = {
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  day: "День",
};

export default async function AgencyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; date?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { range, date } = await searchParams;
  const timeZone = await getUserTimeZone();
  const key: RangeKey =
    range === "month" || range === "quarter" || range === "day" ? range : "week";

  // Часы спрашиваем один раз на страницу и передаём вниз: строки списка
  // должны сравниваться с одним моментом, а не каждая со своим
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  // Только режим «День» умеет листать на другие даты; остальные режимы
  // по-прежнему начинаются с сегодняшней полуночи
  const pickedDay = key === "day" ? parseDateParam(date) : null;
  const from = pickedDay ?? todayStart;
  const to = new Date(from);
  to.setDate(to.getDate() + RANGES[key]);

  // Неделя назад: встречи, которые прошли и не получили оценки. Календарь
  // смотрит вперёд, и без этого блока такая задача не видна нигде
  const feedbackSince = new Date(todayStart);
  feedbackSince.setDate(feedbackSince.getDate() - 7);

  const canManageInterviews = canDo(actor, "interview.proposeSlots");

  const [interviews, needFeedback] = await Promise.all([
    listInterviews(actor, { from, to }),
    canManageInterviews
      ? listUnratedInterviews(actor, feedbackSince)
      : Promise.resolve([]),
  ]);

  const feedUrl = await calendarFeedUrl(actor.id);

  // Задания: список на период, кому можно поставить и к каким вакансиям привязать
  const canTasks = canDo(actor, "task.manage");
  const [tasks, assignees, taskVacancies] = canTasks
    ? await Promise.all([
        listTasks(actor, { from, to }),
        listAssignableUsers(actor),
        prisma.vacancy.findMany({
          where: {
            ...visibleVacanciesFilter(actor),
            status: { notIn: ["DRAFT", "CLOSED_SUCCESS", "CLOSED_CANCELLED", "CLOSED_FAILED"] },
          },
          orderBy: { number: "desc" },
          take: 100,
          select: { id: true, number: true, title: true },
        }),
      ])
    : [[], [], []];
  // Новое задание по умолчанию: в режиме «День» 10:00 выбранного дня в зоне
  // человека (не полночь сервера плюс десять часов), иначе через час
  const defaultDue =
    key === "day"
      ? zonedToUtc(`${toDateParam(from)}T10:00`, timeZone)
      : new Date(Math.ceil((now.getTime() + 3_600_000) / 900_000) * 900_000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>Календарь</PageTitle>
          <p className="text-sm text-muted-foreground">
            Интервью и встречи, ждущие согласования времени
          </p>
        </div>
        <CalendarSubscription url={feedUrl} />
      </div>

      <FilterChipGroup label="Период">
        {(Object.keys(RANGES) as RangeKey[]).map((r) => (
          <FilterChip key={r} href={`/a/calendar?range=${r}`} selected={key === r}>
            {RANGE_LABELS[r]}
          </FilterChip>
        ))}
      </FilterChipGroup>

      {key === "day" && (
        <DayNavigator from={from} isToday={from.getTime() === todayStart.getTime()} />
      )}

      {canTasks && (
        <TasksPanel
          tasks={tasks.map((t) => ({
            ...t,
            dueAt: t.dueAt.toISOString(),
            completedAt: t.completedAt?.toISOString() ?? null,
          }))}
          assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))}
          vacancies={taskVacancies.map((v) => ({ id: v.id, label: `№${v.number} ${v.title}` }))}
          currentUserId={actor.id}
          defaultDue={defaultDue.toISOString()}
        />
      )}

      <CalendarView
        interviews={interviews}
        hrefBase="/a/applications"
        showClient
        canManageInterviews={canManageInterviews}
        needFeedback={needFeedback}
        now={now.getTime()}
      />
    </div>
  );
}

/** Листание дней в режиме «День»: вчера, выбранная дата, завтра. */
function DayNavigator({ from, isToday }: { from: Date; isToday: boolean }) {
  const prev = new Date(from);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  const title = formatDayTitle(from);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <Link
          href={`/a/calendar?range=day&date=${toDateParam(prev)}`}
          aria-label="Предыдущий день"
        >
          ‹
        </Link>
      </Button>
      <span className="min-w-40 text-center text-sm font-medium">
        {isToday ? `Сегодня, ${title}` : title.charAt(0).toUpperCase() + title.slice(1)}
      </span>
      <Button asChild size="sm" variant="outline">
        <Link
          href={`/a/calendar?range=day&date=${toDateParam(next)}`}
          aria-label="Следующий день"
        >
          ›
        </Link>
      </Button>
      {!isToday && (
        <Button asChild size="sm" variant="ghost">
          <Link href="/a/calendar?range=day">Сегодня</Link>
        </Button>
      )}
    </div>
  );
}
