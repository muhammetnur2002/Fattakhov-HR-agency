"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Timer } from "lucide-react";
import { useMemo, useState } from "react";

import {
  matchesPerson,
  parsePersonFilter,
  personFilterValue,
  type CalendarInterviewDTO,
  type CalendarTaskDTO,
  type PersonFilter,
} from "@/components/calendar/calendar-model";
import { CalendarDay } from "@/components/calendar/calendar-day";
import { CalendarMonth } from "@/components/calendar/calendar-month";
import { useNow } from "@/components/calendar/calendar-parts";
import { CalendarYear, type DayCounts } from "@/components/calendar/calendar-year";
import {
  TaskDetailDialog,
  TaskFormDialog,
  type AssigneeDTO,
  type TaskDraft,
  type VacancyDTO,
} from "@/components/calendar/task-dialogs";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { remainingText } from "@/lib/calendar/countdown";
import {
  addDays,
  addMonths,
  atMinutes,
  dateTimeLabel,
  dayKeyOf,
  dayTitle,
  minutesOfDay,
  monthStart,
  monthTitle,
  toMoscowInput,
  yearOf,
  type DayKey,
} from "@/lib/calendar/moscow";
import { useReturnFocus } from "@/lib/hooks/use-return-focus";

export type CalendarView = "year" | "month" | "day";

const VIEW_LABELS: Record<CalendarView, string> = { year: "Год", month: "Месяц", day: "День" };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Начало новой задачи по умолчанию: следующий час сегодня или 10:00 выбранного дня. */
function defaultStart(anchor: DayKey, today: DayKey, now: Date): string {
  if (anchor === today) {
    const next = Math.ceil((minutesOfDay(now) + 1) / 60) * 60;
    // Поздно вечером следующего часа в этих сутках уже нет: ставим на последний
    return toMoscowInput(atMinutes(anchor, Math.min(next, 23 * 60)));
  }
  return toMoscowInput(atMinutes(anchor, 10 * 60));
}

/**
 * Календарь агентства: переключатель Год / Месяц / День, стрелки, «Сегодня», плашка
 * ближайшего дедлайна, фильтр по сотруднику, создание и правка задач.
 *
 * Навигация идёт адресом (?view=…&date=…): сервер отдаёт данные ровно под выбранный
 * диапазон, повторяющиеся задачи разворачиваются там же. Клиентской остаётся
 * интерактивная часть: фильтр, масштаб дня, окна задач, живое «осталось».
 */
export function CalendarBoard({
  view,
  anchor,
  today,
  nowIso,
  tasks,
  interviews,
  dayCounts,
  overdue,
  upcomingDeadlines,
  assignees,
  vacancies,
  currentUserId,
  canFilter,
  hrefBase,
}: {
  view: CalendarView;
  anchor: DayKey;
  today: DayKey;
  nowIso: string;
  tasks: CalendarTaskDTO[];
  interviews: CalendarInterviewDTO[];
  /** Только для года: сколько событий в каждый день. */
  dayCounts: DayCounts;
  overdue: CalendarTaskDTO[];
  upcomingDeadlines: CalendarTaskDTO[];
  assignees: AssigneeDTO[];
  vacancies: VacancyDTO[];
  currentUserId: string;
  /** Видит ли человек чужие назначенные задачи: тогда есть фильтр «Все / Мои / сотрудник». */
  canFilter: boolean;
  hrefBase: string;
}) {
  const now = useNow(nowIso);
  const returnFocus = useReturnFocus();
  const [filter, setFilter] = useState<PersonFilter>("all");
  const [detail, setDetail] = useState<CalendarTaskDTO | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);

  const href = (v: CalendarView, date?: DayKey) => `/a/calendar?view=${v}${date ? `&date=${date}` : ""}`;

  const shownTasks = useMemo(
    () => tasks.filter((t) => matchesPerson(filter, currentUserId, t.assignee.id)),
    [tasks, filter, currentUserId],
  );
  const shownInterviews = useMemo(
    () => interviews.filter((i) => matchesPerson(filter, currentUserId, i.participantIds)),
    [interviews, filter, currentUserId],
  );
  const shownOverdue = overdue.filter((t) => matchesPerson(filter, currentUserId, t.assignee.id));
  const nextDeadline = upcomingDeadlines.find(
    (t) => matchesPerson(filter, currentUserId, t.assignee.id) && new Date(t.startsAt) >= new Date(now.getTime() - 60_000),
  );

  // Навигация: на сколько листать зависит от вида
  const prevDate = view === "year" ? addMonths(anchor, -12) : view === "month" ? addMonths(monthStart(anchor), -1) : addDays(anchor, -1);
  const nextDate = view === "year" ? addMonths(anchor, 12) : view === "month" ? addMonths(monthStart(anchor), 1) : addDays(anchor, 1);
  const unit = view === "year" ? "год" : view === "month" ? "месяц" : "день";
  const title =
    view === "year"
      ? String(yearOf(anchor))
      : view === "month"
        ? monthTitle(anchor)
        : `${capitalize(dayTitle(anchor))}${anchor === today ? " (сегодня)" : ""}`;
  const isCurrent =
    view === "year"
      ? yearOf(anchor) === yearOf(today)
      : view === "month"
        ? monthStart(anchor) === monthStart(today)
        : anchor === today;

  function openTask(task: CalendarTaskDTO, opener: HTMLElement) {
    returnFocus.remember(opener);
    setDetail(task);
  }
  function openNew(startsLocal: string, opener: HTMLElement) {
    returnFocus.remember(opener);
    setDraft({ kind: "new", startsLocal });
  }

  return (
    <div className="space-y-4">
      {nextDeadline ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-secondary/40 px-3 py-2 text-sm">
          <Timer className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Ближайший дедлайн:{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={(e) => openTask(nextDeadline, e.currentTarget)}
            >
              {nextDeadline.title}
            </button>{" "}
            · {dateTimeLabel(new Date(nextDeadline.startsAt))} ·{" "}
            <span className="font-medium">{remainingText(new Date(nextDeadline.startsAt), now)}</span>
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ближайших дедлайнов нет.</p>
      )}

      {shownOverdue.length > 0 && (
        <details className="rounded-lg border border-destructive/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-destructive">
            Просрочено: {shownOverdue.length}
          </summary>
          <ul className="mt-2 space-y-1">
            {shownOverdue.map((task) => (
              <li key={`${task.id}@${task.occurrence}`}>
                <button
                  type="button"
                  className="text-left underline underline-offset-2"
                  onClick={(e) => openTask(task, e.currentTarget)}
                >
                  {task.title}
                </button>{" "}
                <span className="text-xs text-muted-foreground">{dateTimeLabel(new Date(task.startsAt))}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={href(view, prevDate)} aria-label={`Предыдущий ${unit}`}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center text-base font-medium" aria-live="polite">
            {title}
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href={href(view, nextDate)} aria-label={`Следующий ${unit}`}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {!isCurrent && (
            <Button asChild size="sm" variant="ghost">
              <Link href={href(view)}>Сегодня</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChipGroup label="Вид календаря">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <FilterChip key={v} href={href(v, anchor)} selected={view === v}>
                {VIEW_LABELS[v]}
              </FilterChip>
            ))}
          </FilterChipGroup>

          {canFilter && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only sm:not-sr-only">Чьи задачи</span>
              <NativeSelect
                value={personFilterValue(filter)}
                onChange={(e) => setFilter(parsePersonFilter(e.target.value))}
                                aria-label="Чьи задачи показывать"
              >
                <option value="all">Все</option>
                <option value="mine">Мои</option>
                {assignees
                  .filter((a) => a.id !== currentUserId)
                  .map((a) => (
                    <option key={a.id} value={`user:${a.id}`}>
                      {a.fullName}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          )}

          <Button type="button" size="sm" onClick={(e) => openNew(defaultStart(anchor, today, now), e.currentTarget)}>
            <Plus className="size-4" aria-hidden />
            Задача
          </Button>
        </div>
      </div>

      {view === "year" && (
        <CalendarYear
          year={yearOf(anchor)}
          today={today}
          counts={dayCounts}
          href={(v, date) => href(v, date)}
        />
      )}
      {view === "month" && (
        <CalendarMonth
          month={anchor}
          today={today}
          tasks={shownTasks}
          interviews={shownInterviews}
          hrefBase={hrefBase}
          hrefDay={(day) => href("day", day)}
          onOpenTask={openTask}
          onAddTask={(day, opener) => openNew(defaultStart(day, today, now), opener)}
        />
      )}
      {view === "day" && (
        <CalendarDay
          day={anchor}
          today={today}
          now={now}
          tasks={shownTasks.filter((t) => dayKeyOf(new Date(t.startsAt)) === anchor)}
          interviews={shownInterviews.filter((i) => dayKeyOf(new Date(i.startsAt)) === anchor)}
          hrefBase={hrefBase}
          currentUserId={currentUserId}
          onOpenTask={openTask}
          onCreateAt={openNew}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Время московское. <span className="inline-block size-2 rounded-full bg-primary align-middle" aria-hidden /> задачи,{" "}
        <span className="inline-block size-2 rounded-full bg-cal-interview align-middle" aria-hidden /> интервью. Суббота — жёлтая
        рамка, воскресенье — красная.
      </p>

      {detail && (
        <TaskDetailDialog
          task={detail}
          now={now}
          currentUserId={currentUserId}
          onClose={() => setDetail(null)}
          onEdit={(task) => {
            setDetail(null);
            setDraft({ kind: "edit", task });
          }}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        />
      )}
      {draft && (
        <TaskFormDialog
          draft={draft}
          assignees={assignees}
          vacancies={vacancies}
          currentUserId={currentUserId}
          onClose={() => setDraft(null)}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        />
      )}
    </div>
  );
}
