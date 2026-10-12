import { CalendarBoard, type CalendarView } from "@/components/calendar/calendar-board";
import {
  toTaskDTO,
  type CalendarInterviewDTO,
} from "@/components/calendar/calendar-model";
import type { DayCounts } from "@/components/calendar/calendar-year";
import { CalendarSubscription } from "@/components/interviews/calendar-subscription";
import { CalendarView as InterviewList } from "@/components/interviews/calendar-view";
import { PageTitle } from "@/components/ui/page-title";
import { canDo, visibleVacanciesFilter } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { calendarFeedUrl } from "@/lib/calendar/feed";
import {
  addDays,
  dayKeyOf,
  isDayKey,
  monthGrid,
  startOfDay,
  yearOf,
  type DayKey,
} from "@/lib/calendar/moscow";
import { prisma } from "@/lib/db/prisma";
import {
  listAssignableUsers,
  listOverdueTasks,
  listTasks,
  seesAllAssignedTasks,
  upcomingDeadlines,
} from "@/lib/services/calendar-tasks";
import { listInterviews, listUnratedInterviews } from "@/lib/services/interviews";

export const metadata = { title: "Календарь" };

/**
 * Календарь агентства: задачи и интервью в одной сетке (год, месяц, день).
 *
 * Дата и вид — в адресе (?view=month&date=2026-10-12). Все границы дней считаются по
 * Москве (lib/calendar/moscow.ts), независимо от часового пояса сервера. Данные
 * берутся ровно за видимый диапазон; повторяющиеся задачи разворачиваются в нём же.
 */
export default async function AgencyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { view: viewParam, date } = await searchParams;

  // Часы спрашиваем один раз на страницу и передаём вниз
  const now = new Date();
  const today = dayKeyOf(now);
  const view: CalendarView = viewParam === "year" || viewParam === "day" ? viewParam : "month";
  const anchor: DayKey = isDayKey(date) ? date : today;

  const weeks = monthGrid(anchor);
  const range =
    view === "year"
      ? { from: startOfDay(`${yearOf(anchor)}-01-01`), to: startOfDay(`${yearOf(anchor) + 1}-01-01`) }
      : view === "month"
        ? { from: startOfDay(weeks[0][0]), to: startOfDay(addDays(weeks[0][0], weeks.length * 7)) }
        : { from: startOfDay(anchor), to: startOfDay(addDays(anchor, 1)) };

  const canManageInterviews = canDo(actor, "interview.proposeSlots");
  const canTasks = canDo(actor, "task.manage");

  // Неделя назад: встречи, которые прошли и не получили оценки
  const feedbackSince = new Date(now.getTime() - 7 * 86_400_000);

  const [interviews, needFeedback, feedUrl] = await Promise.all([
    listInterviews(actor, range),
    canManageInterviews ? listUnratedInterviews(actor, feedbackSince) : Promise.resolve([]),
    calendarFeedUrl(actor.id),
  ]);

  const [tasks, overdue, deadlines, assignees, vacancies] = canTasks
    ? await Promise.all([
        listTasks(actor, range),
        listOverdueTasks(actor, { before: now }),
        upcomingDeadlines(actor, now),
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
    : [[], [], [], [], []];

  // Интервью без времени (ждут согласования) в сетке не показываются: они остаются списком ниже
  const scheduled = interviews.filter((i) => i.scheduledAt && i.status !== "CANCELLED");
  const pending = interviews.filter((i) => !i.scheduledAt);

  const interviewDTOs: CalendarInterviewDTO[] = scheduled.map((i) => ({
    id: i.id,
    applicationId: i.applicationId,
    startsAt: i.scheduledAt!.toISOString(),
    durationMinutes: i.durationMinutes,
    title: i.application.candidate.fullName,
    subtitle: `№${i.vacancy.number} ${i.vacancy.title}`,
    participantIds: i.participantUserIds,
  }));

  // Год: в браузер уходят только числа по дням, без самих задач
  const dayCounts: DayCounts = {};
  if (view === "year") {
    for (const t of tasks) {
      const key = dayKeyOf(t.startsAt);
      (dayCounts[key] ??= { tasks: 0, interviews: 0 }).tasks++;
    }
    for (const i of scheduled) {
      const key = dayKeyOf(i.scheduledAt!);
      (dayCounts[key] ??= { tasks: 0, interviews: 0 }).interviews++;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>Календарь</PageTitle>
          <p className="text-sm text-muted-foreground">Задачи и интервью. Время московское.</p>
        </div>
        <CalendarSubscription url={feedUrl} />
      </div>

      <CalendarBoard
        view={view}
        anchor={anchor}
        today={today}
        nowIso={now.toISOString()}
        tasks={view === "year" ? [] : tasks.map(toTaskDTO)}
        interviews={view === "year" ? [] : interviewDTOs}
        dayCounts={dayCounts}
        overdue={overdue.map(toTaskDTO)}
        upcomingDeadlines={deadlines.map(toTaskDTO)}
        assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))}
        vacancies={vacancies.map((v) => ({ id: v.id, label: `№${v.number} ${v.title}` }))}
        currentUserId={actor.id}
        canFilter={canTasks && seesAllAssignedTasks(actor)}
        hrefBase="/a/applications"
      />

      {/* Встречи, которым нужно действие: согласовать время или записать результат */}
      {(pending.length > 0 || needFeedback.length > 0) && (
        <InterviewList
          interviews={pending}
          hrefBase="/a/applications"
          showClient
          canManageInterviews={canManageInterviews}
          needFeedback={needFeedback}
          now={now.getTime()}
        />
      )}
    </div>
  );
}
