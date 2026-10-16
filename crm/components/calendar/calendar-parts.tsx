"use client";

import Link from "next/link";
import { CalendarClock, Lock, Repeat } from "lucide-react";
import { useEffect, useState } from "react";

import type { CalendarInterviewDTO, CalendarTaskDTO } from "@/components/calendar/calendar-model";
import { addDays, isSaturday, isSunday, timeLabel, type DayKey } from "@/lib/calendar/moscow";
import { cn } from "@/lib/utils";

/**
 * Рамка по дню недели. Выходные выделены РАМКОЙ, не фоном: фон берётся из токенов
 * темы (светлая и тёмная), а жёлтая (суббота) и красная (воскресенье) рамки видны на обоих.
 * Цвета лежат в токенах --cal-sat / --cal-sun (app/globals.css).
 */
export function weekendBorder(key: DayKey): string {
  if (isSaturday(key)) return "border-2 border-cal-sat";
  if (isSunday(key)) return "border-2 border-cal-sun";
  return "border border-border";
}

/**
 * «Сейчас» для клиентского календаря: стартует от значения, пришедшего с сервера
 * (разметка при гидратации совпадает), и раз в минуту обновляется браузером.
 */
export function useNow(initialIso: string): Date {
  const [now, setNow] = useState(() => new Date(initialIso));
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 60_000);
    // Вкладка проспала минуты в фоне: при возврате сразу обновляем
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/**
 * Стрелки в сетке дней: фокус переходит на соседний день (влево/вправо на день,
 * вверх/вниз на неделю). Элементы дней помечены data-daykey.
 */
export function onGridArrows(event: React.KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  const key = target.dataset.daykey;
  if (!key) return;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (!delta) return;
  const next = event.currentTarget.querySelector<HTMLElement>(`[data-daykey="${addDays(key, delta)}"]`);
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

/** Заливки чипов — полупрозрачные (color-mix), поэтому читаются на светлой и тёмной теме. */
export const TASK_TINT = "bg-[color-mix(in_srgb,var(--primary)_22%,transparent)]";
export const INTERVIEW_TINT = "bg-[color-mix(in_srgb,var(--cal-interview)_24%,transparent)]";

/*
  Чип в ячейке месяца: значок и время в начале, название следом.

  Название стоит рядом со временем, только если помещается целиком; не помещается —
  переносится под время и получает всю ширину чипа (flex-wrap и базис по содержимому
  у CHIP_TITLE), а длинное делится по словам на две строки. Раньше чип был одной строкой
  с `truncate`, и в узкой ячейке от имени кандидата оставалась одна буква: «15:00 Э…»
  (замер 15.10.2026: видимая доля имени 15–19% на 1280 и 8–10% на планшете). Многоточие
  осталось у названия длиннее двух строк; полное — в подсказке и в имени кнопки.
*/
const CHIP =
  "flex w-full flex-wrap items-center gap-x-1 overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-left text-xs leading-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-1";
const CHIP_TITLE = "min-w-0 max-w-full flex-auto line-clamp-2 break-words";

/** Чип задачи в ячейке месяца: время и название; клик открывает карточку. */
export function TaskChip({
  task,
  onOpen,
}: {
  task: CalendarTaskDTO;
  onOpen: (task: CalendarTaskDTO, opener: HTMLElement) => void;
}) {
  const done = Boolean(task.completedAt);
  const time = timeLabel(new Date(task.startsAt));
  return (
    <button
      type="button"
      onClick={(e) => onOpen(task, e.currentTarget)}
      title={task.title}
      aria-label={`Задача ${task.title}, ${time}${done ? ", выполнена" : task.overdue ? ", просрочена" : ""}`}
      className={cn(
        CHIP,
        TASK_TINT,
        task.overdue ? "border-destructive" : "border-primary",
        done && "line-through opacity-60",
      )}
    >
      {task.personal && <Lock className="size-3 shrink-0" aria-hidden />}
      {task.recurrenceRule && <Repeat className="size-3 shrink-0" aria-hidden />}
      <span className="shrink-0 tabular-nums">{time}</span>
      <span className={CHIP_TITLE}>{task.title}</span>
    </button>
  );
}

/** Чип интервью: другой цвет и значок, ведёт на карточку отклика. */
export function InterviewChip({ interview, hrefBase }: { interview: CalendarInterviewDTO; hrefBase: string }) {
  const time = timeLabel(new Date(interview.startsAt));
  return (
    <Link
      href={`${hrefBase}/${interview.applicationId}`}
      title={`${interview.title}, ${interview.subtitle}`}
      aria-label={`Интервью ${interview.title}, ${time}`}
      className={cn(CHIP, "border-cal-interview", INTERVIEW_TINT)}
    >
      <CalendarClock className="size-3 shrink-0" aria-hidden />
      <span className="shrink-0 tabular-nums">{time}</span>
      <span className={CHIP_TITLE}>{interview.title}</span>
    </Link>
  );
}
