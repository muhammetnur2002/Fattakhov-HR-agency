"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  submitFeedbackAction,
  transitionInterviewAction,
} from "@/app/actions/interviews";
import { Button } from "@/components/ui/button";

/**
 * Действия по встрече прямо в календаре.
 *
 * Календарь — то место, где человек смотрит «что у меня сегодня» и
 * «что было вчера». Раньше любое действие по встрече требовало уйти
 * на карточку кандидата и найти там нужный блок, а рекрутёр за день
 * проходит этот путь столько раз, сколько у него встреч.
 *
 * Здесь только то, что делают сразу после взгляда на строку: оценить
 * прошедшую встречу, отметить неявку, попросить другое время. Всё
 * остальное (участники, ссылка для кандидата, слоты) осталось на
 * карточке: в строке календаря такой форме не место.
 */
export function CalendarRowActions({
  interviewId,
  applicationId,
  status,
  isPast,
  feedbackRating,
  href,
}: {
  interviewId: string;
  applicationId: string;
  status: string;
  /**
   * Встреча уже прошла. Считается на сервере, а не здесь.
   *
   * Раньше здесь стояло `scheduledAt.getTime() < Date.now()` — вызов
   * во время рендера, то есть разное значение у серверной отрисовки
   * и у гидратации клиента. У встречи, которая заканчивается прямо
   * сейчас, это давало «Перенести» в разметке с сервера и «Не пришёл»
   * после гидратации: рассинхрон и предупреждение React.
   */
  isPast: boolean;
  feedbackRating: number | null;
  /** Карточка кандидата — туда уходим за полной формой слотов. */
  href: string;
}) {
  const [transitionState, transition] = useActionState(
    transitionInterviewAction,
    {},
  );
  const [feedbackState, feedback] = useActionState(submitFeedbackAction, {});

  const needsSlots =
    status === "SLOTS_REQUESTED" || status === "RESCHEDULE_REQUESTED";

  // Слоты уже у кандидата: время не назначено, но и предлагать заново
  // нужно не всегда — поэтому кнопка тише и названа как на карточке
  const awaitingCandidate = status === "SLOTS_PROPOSED";

  if (needsSlots || awaitingCandidate) {
    return (
      <Button size="sm" variant={needsSlots ? "default" : "outline"} asChild>
        <Link href={`${href}#interviews`}>
          {needsSlots ? "Предложить время" : "Другие варианты"}
        </Link>
      </Button>
    );
  }

  // COMPLETED сюда попадает из блока «прошли — нужна оценка»: статус уже
  // закрыт, но результат не записан, и оценку принять всё ещё можно
  if (status !== "CONFIRMED" && status !== "COMPLETED") return null;

  // Оценку спрашиваем только у встречи, которая уже прошла: у будущей
  // такой вопрос выглядит как ошибка интерфейса
  const message = feedbackState.error ?? transitionState.error;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPast && feedbackRating == null && (
        <form action={feedback} className="flex items-center gap-1.5">
          <input type="hidden" name="interviewId" value={interviewId} />
          <input type="hidden" name="applicationId" value={applicationId} />
          <span className="text-xs text-muted-foreground">Как прошло?</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <RatingButton key={n} value={n} />
          ))}
        </form>
      )}

      {/* У закрытой встречи менять уже нечего — только записать результат */}
      {status === "CONFIRMED" && (
        <form action={transition}>
          <input type="hidden" name="interviewId" value={interviewId} />
          <input type="hidden" name="applicationId" value={applicationId} />
          <input
            type="hidden"
            name="to"
            value={isPast ? "NO_SHOW" : "RESCHEDULE_REQUESTED"}
          />
          <PlainButton label={isPast ? "Не пришёл" : "Перенести"} />
        </form>
      )}

      {message && (
        <span className="text-xs text-destructive">{message}</span>
      )}
    </div>
  );
}

function RatingButton({ value }: { value: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="rating"
      value={String(value)}
      size="sm"
      variant="outline"
      disabled={pending}
      className="size-7 p-0 tabular-nums"
    >
      {value}
    </Button>
  );
}

function PlainButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
      {label}
    </Button>
  );
}
