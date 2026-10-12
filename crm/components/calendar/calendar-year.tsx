"use client";

import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { onGridArrows, weekendBorder } from "@/components/calendar/calendar-parts";
import {
  addMonths,
  dayOfMonth,
  dayTitle,
  monthGrid,
  monthIndexOf,
  monthTitle,
  WEEKDAYS_SHORT,
  type DayKey,
} from "@/lib/calendar/moscow";
import { cn } from "@/lib/utils";

export type DayCounts = Record<DayKey, { tasks: number; interviews: number }>;

/**
 * Год: двенадцать мини-месяцев. Клик по названию месяца открывает месяц, по дню — день.
 * Точка под числом: в этот день есть задачи (синяя) или интервью (зелёная).
 */
export function CalendarYear({
  year,
  today,
  counts,
  href,
}: {
  year: number;
  today: DayKey;
  counts: DayCounts;
  href: (view: "month" | "day", date: DayKey) => string;
}) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01-15`, i));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" onKeyDown={onGridArrows}>
      {months.map((month) => (
        <Panel key={month} role="group" aria-label={monthTitle(month)} className="space-y-1 bg-card p-2">
          <h3 className="mb-1 text-sm font-medium">
            <Link href={href("month", month)} className="hover:underline focus-visible:outline-2">
              {monthTitle(month).replace(` ${year}`, "")}
            </Link>
          </h3>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground" aria-hidden>
            {WEEKDAYS_SHORT.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <div className="mt-0.5 grid grid-cols-7 gap-0.5">
            {monthGrid(month)
              .flat()
              .map((day) => {
                // Дни соседних месяцев в мини-сетке не рисуем: они есть в своём месяце
                if (monthIndexOf(day) !== monthIndexOf(month)) return <span key={day} aria-hidden />;
                const c = counts[day];
                const isToday = day === today;
                return (
                  <Link
                    key={day}
                    href={href("day", day)}
                    data-daykey={day}
                    aria-label={`${dayTitle(day)}${isToday ? ", сегодня" : ""}${c ? `, задач: ${c.tasks}, интервью: ${c.interviews}` : ""}`}
                    className={cn(
                      "relative flex aspect-square min-h-7 flex-col items-center justify-center rounded text-xs tabular-nums hover:bg-muted focus-visible:outline-2",
                      weekendBorder(day),
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full",
                        isToday && "bg-cal-sun font-semibold text-white",
                      )}
                    >
                      {dayOfMonth(day)}
                    </span>
                    {c && (
                      <span className="absolute bottom-0.5 flex gap-0.5" aria-hidden>
                        {c.tasks > 0 && <span className="size-1 rounded-full bg-primary" />}
                        {c.interviews > 0 && <span className="size-1 rounded-full bg-cal-interview" />}
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        </Panel>
      ))}
    </div>
  );
}
