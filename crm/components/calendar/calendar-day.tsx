"use client";

import Link from "next/link";
import { CalendarClock, ChevronDown, ChevronUp, Lock, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  DAY_STEPS,
  layoutDay,
  minutesRange,
  SLOT_HEIGHT,
  taskKey,
  windowFor,
  WINDOW_MINUTES,
  type CalendarInterviewDTO,
  type CalendarTaskDTO,
  type DayStep,
} from "@/components/calendar/calendar-model";
import { INTERVIEW_TINT, TASK_TINT, weekendBorder } from "@/components/calendar/calendar-parts";
import { Button } from "@/components/ui/button";
import { remainingText } from "@/lib/calendar/countdown";
import { atMinutes, minutesOfDay, timeLabel, toMoscowInput, type DayKey } from "@/lib/calendar/moscow";
import { cn } from "@/lib/utils";

/** Подпись слота: 9:00, 14:35. */
function slotLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Блок на сетке дня: задача или интервью с уже посчитанным положением в минутах. */
type Block =
  | { kind: "task"; key: string; startMin: number; endMin: number; task: CalendarTaskDTO }
  | { kind: "interview"; key: string; startMin: number; endMin: number; interview: CalendarInterviewDTO };

/**
 * День: колонка по часам со слотами. Ползунок задаёт шаг слота: 60, 30, 15 или 5 минут.
 * На шагах 15 и 5 показывается окно в 4 и 2 часа вокруг текущего времени (в другой день —
 * вокруг 10:00), его можно сдвинуть кнопками «Раньше» и «Позже». Красная линия — текущее
 * время московское, обновляется раз в минуту вместе с `now`.
 *
 * Клик по пустому слоту создаёт задачу на это время. Слоты — вспомогательные кнопки
 * вне порядка Tab (их сотни); с клавиатуры задачу создаёт кнопка «Задача» над календарём.
 */
export function CalendarDay({
  day,
  today,
  now,
  tasks,
  interviews,
  hrefBase,
  currentUserId,
  onOpenTask,
  onCreateAt,
}: {
  day: DayKey;
  today: DayKey;
  now: Date;
  tasks: CalendarTaskDTO[];
  interviews: CalendarInterviewDTO[];
  hrefBase: string;
  currentUserId: string;
  onOpenTask: (task: CalendarTaskDTO, opener: HTMLElement) => void;
  onCreateAt: (startsLocal: string, opener: HTMLElement) => void;
}) {
  const isToday = day === today;
  const [stepIndex, setStepIndex] = useState(0);
  const step: DayStep = DAY_STEPS[stepIndex];
  const nowMin = minutesOfDay(now);
  // Вокруг чего строить окно: текущее время сегодня, иначе начало рабочего дня
  const focus = isToday ? nowMin : 10 * 60;

  const [winStart, setWinStart] = useState(() => windowFor(DAY_STEPS[0], focus).start);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef(focus);
  // Актуальный фокус для эффектов ниже; сам он перерисовку окна не вызывает
  useEffect(() => {
    nowRef.current = focus;
  }, [focus]);

  // Другой день или шаг: окно пересчитывается вокруг фокуса
  useEffect(() => {
    setWinStart(windowFor(step, nowRef.current).start);
  }, [day, step]);

  const size = WINDOW_MINUTES[step];
  const winEnd = winStart + size;
  const rowH = SLOT_HEIGHT[step];
  const perMinute = rowH / step;
  const slotCount = Math.ceil(size / step);
  const totalHeight = slotCount * rowH;

  // На шагах 60 и 30 видны сутки: прокручиваем к текущему времени (или к утру)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = size >= 1440 ? Math.max(0, nowRef.current - 90) : 0;
    el.scrollTop = target * perMinute;
  }, [day, step, size, perMinute]);

  const blocks: Block[] = [];
  for (const task of tasks) {
    const range = minutesRange(new Date(task.startsAt), task.durationMinutes, day);
    if (range) blocks.push({ kind: "task", key: taskKey(task), task, ...range });
  }
  for (const interview of interviews) {
    const range = minutesRange(new Date(interview.startsAt), interview.durationMinutes, day);
    if (range) blocks.push({ kind: "interview", key: `i-${interview.id}`, interview, ...range });
  }
  const placement = layoutDay(blocks);
  const visible = blocks.filter((b) => b.endMin > winStart && b.startMin < winEnd);
  const hidden = blocks.length - visible.length;

  const shiftWindow = (direction: -1 | 1) =>
    setWinStart((current) => Math.min(Math.max(current + (direction * size) / 2, 0), 1440 - size));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span>Масштаб</span>
          <input
            type="range"
            min={0}
            max={DAY_STEPS.length - 1}
            step={1}
            value={stepIndex}
            onChange={(e) => setStepIndex(Number(e.target.value))}
            aria-label="Масштаб дня: шаг слота"
            aria-valuetext={step === 60 ? "шаг 1 час" : `шаг ${step} минут`}
            className="w-32 accent-primary"
          />
          <span className="min-w-14 text-muted-foreground tabular-nums">{step === 60 ? "1 час" : `${step} мин`}</span>
        </label>

        {size < 1440 && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftWindow(-1)} disabled={winStart <= 0} aria-label="Показать более раннее время">
              <ChevronUp className="size-4" aria-hidden />
              Раньше
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftWindow(1)} disabled={winEnd >= 1440} aria-label="Показать более позднее время">
              <ChevronDown className="size-4" aria-hidden />
              Позже
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {slotLabel(winStart)}–{slotLabel(winEnd)}
            </span>
          </div>
        )}
        {hidden > 0 && (
          <span className="text-xs text-muted-foreground">Ещё событий вне окна: {hidden}</span>
        )}
      </div>

      <div
        ref={scrollRef}
        className={cn("relative max-h-[70vh] overflow-y-auto rounded-lg bg-card", weekendBorder(day))}
      >
        <div className="relative" style={{ height: totalHeight }}>
          {Array.from({ length: slotCount }, (_, i) => {
            const minutes = winStart + i * step;
            const onHour = minutes % 60 === 0;
            return (
              <button
                key={minutes}
                type="button"
                tabIndex={-1}
                onClick={(e) => onCreateAt(toMoscowInput(atMinutes(day, minutes)), e.currentTarget)}
                aria-label={`Создать задачу на ${slotLabel(minutes)}`}
                className={cn(
                  "absolute inset-x-0 flex items-start border-t text-left hover:bg-muted/60",
                  onHour ? "border-border" : "border-border/40",
                )}
                style={{ top: i * rowH, height: rowH }}
              >
                <span className="w-14 shrink-0 pr-2 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                  {slotLabel(minutes)}
                </span>
              </button>
            );
          })}

          {/* Блоки лежат поверх слотов; свободное место между ними кликается сквозь контейнер */}
          <div className="pointer-events-none absolute inset-y-0 left-14 right-2">
            {visible.map((block) => {
              const place = placement.get(block.key) ?? { col: 0, cols: 1 };
              const start = Math.max(block.startMin, winStart);
              const end = Math.min(block.endMin, winEnd);
              const style = {
                top: (start - winStart) * perMinute,
                height: Math.max((end - start) * perMinute - 2, 22),
                left: `${(place.col / place.cols) * 100}%`,
                width: `calc(${100 / place.cols}% - 2px)`,
              };

              if (block.kind === "interview") {
                const i = block.interview;
                return (
                  <Link
                    key={block.key}
                    href={`${hrefBase}/${i.applicationId}`}
                    style={style}
                    aria-label={`Интервью ${i.title}, ${timeLabel(new Date(i.startsAt))}`}
                    className={cn(
                      "pointer-events-auto absolute overflow-hidden rounded border-l-2 border-cal-interview px-1.5 py-0.5 text-xs leading-tight text-foreground",
                      INTERVIEW_TINT,
                    )}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <CalendarClock className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{i.title}</span>
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {timeLabel(new Date(i.startsAt))} · {i.subtitle}
                    </span>
                  </Link>
                );
              }

              const t = block.task;
              const done = Boolean(t.completedAt);
              const startsAt = new Date(t.startsAt);
              return (
                <button
                  key={block.key}
                  type="button"
                  style={style}
                  onClick={(e) => onOpenTask(t, e.currentTarget)}
                  aria-label={`Задача ${t.title}, ${timeLabel(startsAt)}${done ? ", выполнена" : t.overdue ? ", просрочена" : ""}`}
                  className={cn(
                    "pointer-events-auto absolute overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-left text-xs leading-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-1",
                    TASK_TINT,
                    t.overdue ? "border-destructive" : "border-primary",
                    done && "opacity-60",
                  )}
                >
                  <span className={cn("flex items-center gap-1 font-medium", done && "line-through")}>
                    {t.personal && <Lock className="size-3 shrink-0" aria-hidden />}
                    {t.recurrenceRule && <Repeat className="size-3 shrink-0" aria-hidden />}
                    <span className="truncate">{t.title}</span>
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {timeLabel(startsAt)}–{timeLabel(new Date(startsAt.getTime() + t.durationMinutes * 60_000))}
                    {t.assignee.id !== currentUserId ? ` · ${t.assignee.fullName}` : ""}
                  </span>
                  {t.hasDeadline && !done && (
                    <span className={cn("block truncate font-medium", t.overdue ? "text-destructive" : "text-foreground")}>
                      {remainingText(startsAt, now)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Красная линия текущего времени: только в сегодняшнем дне и внутри окна */}
          {isToday && nowMin >= winStart && nowMin <= winEnd && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              style={{ top: (nowMin - winStart) * perMinute }}
            >
              <span className="ml-[3.1rem] size-2 -translate-y-px rounded-full bg-cal-sun" />
              <span className="h-0.5 flex-1 -translate-y-px bg-cal-sun" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
