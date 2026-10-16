"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  groupByDay,
  taskKey,
  type CalendarInterviewDTO,
  type CalendarTaskDTO,
} from "@/components/calendar/calendar-model";
import {
  InterviewChip,
  onGridArrows,
  TaskChip,
  weekendBorder,
} from "@/components/calendar/calendar-parts";
import {
  dayOfMonth,
  dayTitle,
  monthGrid,
  monthIndexOf,
  WEEKDAYS_SHORT,
  type DayKey,
} from "@/lib/calendar/moscow";
import { cn } from "@/lib/utils";

/** Сколько чипов помещается в ячейку на широком экране; остальное — «ещё N». */
const MAX_CHIPS = 3;

type Chip =
  | { kind: "interview"; item: CalendarInterviewDTO }
  | { kind: "task"; item: CalendarTaskDTO };

/**
 * Месяц: сетка из семи колонок, понедельник первый. В ячейке до трёх чипов задач и
 * интервью, дальше «ещё N». На телефоне вместо чипов точки и счётчик: ячейка узкая,
 * подробности открывает день.
 */
export function CalendarMonth({
  month,
  today,
  tasks,
  interviews,
  hrefBase,
  hrefDay,
  onOpenTask,
  onAddTask,
}: {
  month: DayKey;
  today: DayKey;
  tasks: CalendarTaskDTO[];
  interviews: CalendarInterviewDTO[];
  hrefBase: string;
  hrefDay: (day: DayKey) => string;
  onOpenTask: (task: CalendarTaskDTO, opener: HTMLElement) => void;
  onAddTask: (day: DayKey, opener: HTMLElement) => void;
}) {
  const weeks = monthGrid(month);
  const tasksByDay = groupByDay(tasks);
  const interviewsByDay = groupByDay(interviews);

  return (
    <div className="space-y-1" onKeyDown={onGridArrows}>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS_SHORT.map((name, i) => (
          <div
            key={name}
            className={cn(
              "rounded py-1",
              i === 5 && "border-2 border-cal-sat",
              i === 6 && "border-2 border-cal-sun",
              i < 5 && "border border-transparent",
            )}
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => {
          const dayTasks = tasksByDay.get(day) ?? [];
          const dayInterviews = interviewsByDay.get(day) ?? [];
          const total = dayTasks.length + dayInterviews.length;
          const inMonth = monthIndexOf(day) === monthIndexOf(month);
          const isToday = day === today;

          // Интервью впереди (их время обычно жёстче), затем задачи по времени
          const chips: Chip[] = [
            ...dayInterviews.map((item): Chip => ({ kind: "interview", item })),
            ...dayTasks.map((item): Chip => ({ kind: "task", item })),
          ];
          const shown = chips.slice(0, MAX_CHIPS);
          const rest = chips.length - shown.length;

          return (
            <div
              key={day}
              className={cn(
                // Соседний месяц — другой фон и серое число, а не opacity на всей ячейке:
                // она гасила и чипы с событиями (3,3:1 у интервью) и число (3,75:1)
                "group relative min-h-16 min-w-0 rounded-md p-1 sm:min-h-28",
                inMonth ? "bg-card" : "bg-muted",
                weekendBorder(day),
              )}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={hrefDay(day)}
                  data-daykey={day}
                  aria-label={`${dayTitle(day)}${isToday ? ", сегодня" : ""}${total ? `, событий: ${total}` : ""}`}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums focus-visible:outline-2",
                    isToday
                      ? "bg-cal-today font-semibold text-white hover:bg-cal-today"
                      : inMonth
                        ? "hover:bg-muted"
                        : "text-muted-foreground hover:bg-card",
                  )}
                >
                  {dayOfMonth(day)}
                </Link>
                <button
                  type="button"
                  onClick={(e) => onAddTask(day, e.currentTarget)}
                  aria-label={`Добавить задачу на ${dayTitle(day)}`}
                  className="hidden size-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>

              {/* Широкий экран: чипы */}
              <ul className="mt-0.5 hidden space-y-0.5 sm:block">
                {shown.map((chip) => (
                  <li key={chip.kind === "task" ? taskKey(chip.item) : `i-${chip.item.id}`}>
                    {chip.kind === "task" ? (
                      <TaskChip task={chip.item} onOpen={onOpenTask} />
                    ) : (
                      <InterviewChip interview={chip.item} hrefBase={hrefBase} />
                    )}
                  </li>
                ))}
                {rest > 0 && (
                  <li>
                    <Link
                      href={hrefDay(day)}
                      className="block px-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      ещё {rest}
                    </Link>
                  </li>
                )}
              </ul>

              {/* Телефон: точки по видам и счётчик, подробности — в дне */}
              {total > 0 && (
                <Link
                  href={hrefDay(day)}
                  aria-label={`${dayTitle(day)}: событий ${total}`}
                  className="mt-1 flex flex-wrap items-center gap-0.5 sm:hidden"
                >
                  {dayTasks.length > 0 && <span className="size-2 rounded-full bg-primary" aria-hidden />}
                  {dayInterviews.length > 0 && <span className="size-2 rounded-full bg-cal-interview" aria-hidden />}
                  <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
