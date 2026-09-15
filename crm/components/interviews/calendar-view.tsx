import Link from "next/link";
import { CalendarClock, MapPin, Video } from "lucide-react";

import { CalendarRowActions } from "@/components/interviews/calendar-row-actions";
import { RequestRescheduleButton } from "@/components/interviews/request-reschedule-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  InterviewFormat,
  InterviewStatus,
  InterviewType,
} from "@/lib/generated/prisma/enums";
import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type CalendarInterview = {
  id: string;
  type: InterviewType;
  status: InterviewStatus;
  format: InterviewFormat;
  scheduledAt: Date | null;
  durationMinutes: number;
  timezone: string;
  meetingUrl: string | null;
  address: string | null;
  feedbackRating: number | null;
  applicationId: string;
  application: { candidate: { id: string; fullName: string } };
  vacancy: {
    id: string;
    number: number;
    title: string;
    client: { name: string };
  };
};

/**
 * Календарь списком, сгруппированным по дням.
 *
 * Сетка месяца выглядит солиднее, но отвечает на вопрос хуже: рекрутеру
 * и клиенту нужно «что у меня ближайшее и с кем», а не общая картина
 * занятости. Список это показывает без кликов.
 */
export function CalendarView({
  interviews,
  hrefBase,
  showClient = false,
  canRequestReschedule = false,
  canManageInterviews = false,
  needFeedback = [],
  now,
}: {
  interviews: CalendarInterview[];
  hrefBase: string;
  showClient?: boolean;
  /** Клиентский кабинет: кнопка «Запросить перенос» на подтверждённых встречах. */
  canRequestReschedule?: boolean;
  /** Агентство с правом interview.proposeSlots: действия по встрече в строке. */
  canManageInterviews?: boolean;
  /** Уже прошли, но результат не записан — задача, а не событие. */
  needFeedback?: CalendarInterview[];
  /**
   * Момент отрисовки в миллисекундах, приходит со страницы.
   *
   * Часы спрашиваются один раз наверху, а не в каждой строке: иначе
   * соседние строки одного списка сравниваются с разными моментами,
   * а в клиентских компонентах разметка сервера расходится
   * с гидратацией.
   */
  now: number;
}) {
  /*
    Утренняя встреча сегодняшнего дня попадает сразу в два списка:
    она уже прошла и ждёт оценки, но день ещё не кончился, и обычная
    группировка по дням её тоже показывает. Одна и та же строка с теми
    же кнопками дважды на экране читается как сбой, поэтому блок задач
    забирает её себе целиком.
  */
  const needsFeedbackIds = new Set(needFeedback.map((i) => i.id));
  const scheduled = interviews.filter(
    (i) => i.scheduledAt && !needsFeedbackIds.has(i.id),
  );
  const pending = interviews.filter((i) => !i.scheduledAt);

  if (interviews.length === 0 && needFeedback.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          В этом периоде встреч нет.
        </CardContent>
      </Card>
    );
  }

  const byDay = new Map<string, CalendarInterview[]>();
  for (const i of scheduled) {
    const key = formatDay(i.scheduledAt!, i.timezone);
    byDay.set(key, [...(byDay.get(key) ?? []), i]);
  }

  return (
    <div className="space-y-6">
      {/* Прошли и молчат о результате — самое короткое дело в списке */}
      {needFeedback.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Прошли — нужна оценка
          </h2>
          <div className="grid gap-2">
            {needFeedback.map((i) => (
              <InterviewRow
                key={i.id}
                interview={i}
                hrefBase={hrefBase}
                showClient={showClient}
                canRequestReschedule={canRequestReschedule}
                canManageInterviews={canManageInterviews}
                now={now}
              />
            ))}
          </div>
        </section>
      )}

      {/* Встречи без времени — это задача, а не событие: показываем сверху */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Ждут согласования времени
          </h2>
          <div className="grid gap-2">
            {pending.map((i) => (
              <InterviewRow
                key={i.id}
                interview={i}
                hrefBase={hrefBase}
                showClient={showClient}
                canRequestReschedule={canRequestReschedule}
                canManageInterviews={canManageInterviews}
                now={now}
              />
            ))}
          </div>
        </section>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-sm font-medium">{day}</h2>
          <div className="grid gap-2">
            {items.map((i) => (
              <InterviewRow
                key={i.id}
                interview={i}
                hrefBase={hrefBase}
                showClient={showClient}
                canRequestReschedule={canRequestReschedule}
                canManageInterviews={canManageInterviews}
                now={now}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function InterviewRow({
  interview,
  hrefBase,
  showClient,
  canRequestReschedule,
  canManageInterviews,
  now,
}: {
  interview: CalendarInterview;
  hrefBase: string;
  showClient: boolean;
  canRequestReschedule: boolean;
  canManageInterviews: boolean;
  /** Момент отрисовки в миллисекундах — один на весь список. */
  now: number;
}) {
  const needsSlots =
    interview.status === "SLOTS_REQUESTED" ||
    interview.status === "RESCHEDULE_REQUESTED";
  const confirmed = interview.status === "CONFIRMED";
  // «Сейчас» приходит сверху одним значением на весь список: у каждой
  // строки свой вызов часов означал бы, что соседние строки сравниваются
  // с разными моментами времени, а в клиентском компоненте — ещё и
  // расхождение разметки сервера с гидратацией
  const isPast =
    interview.scheduledAt != null && interview.scheduledAt.getTime() < now;
  const hasActions =
    canManageInterviews ||
    (confirmed && (interview.meetingUrl || canRequestReschedule));

  return (
    <Card className={cn(needsSlots && "border-primary/50")}>
      {/*
        Раньше время, имя, формат, длительность, статус и кнопки лежали
        в одном flex-wrap ряду и на телефоне переносились как попало —
        кнопка «Присоединиться» могла оказаться зажатой между бейджем
        и текстом длительности. Теперь строка и мета-данные — отдельные
        группы, каждая переносится сама по себе.
      */}
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="flex gap-3">
            <div className="w-14 shrink-0 text-sm font-medium tabular-nums">
              {interview.scheduledAt
                ? formatTime(interview.scheduledAt, interview.timezone)
                : "—"}
            </div>

            <div>
              <Link
                href={`${hrefBase}/${interview.applicationId}`}
                className="font-medium hover:underline"
              >
                {interview.application.candidate.fullName}
              </Link>
              <div className="text-xs text-muted-foreground">
                №{interview.vacancy.number} {interview.vacancy.title}
                {showClient ? ` · ${interview.vacancy.client.name}` : ""}
              </div>
            </div>
          </div>

          <Badge variant={needsSlots ? "destructive" : "secondary"} className="shrink-0">
            {INTERVIEW_STATUS_LABELS[interview.status]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {interview.format === "ONLINE" ? (
                <Video className="size-3.5" />
              ) : (
                <MapPin className="size-3.5" />
              )}
              {INTERVIEW_TYPE_LABELS[interview.type]}
            </span>

            {interview.scheduledAt && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                {interview.durationMinutes} мин
              </span>
            )}
          </div>

          {hasActions && (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {interview.meetingUrl && confirmed && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={interview.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Присоединиться
                  </a>
                </Button>
              )}

              {/* Только для подтверждённой встречи — переносить нечего, пока
                  время не назначено (тогда это просто «ждём слоты», не перенос) */}
              {canRequestReschedule && confirmed && (
                <RequestRescheduleButton interviewId={interview.id} />
              )}

              {canManageInterviews && (
                <CalendarRowActions
                  interviewId={interview.id}
                  applicationId={interview.applicationId}
                  status={interview.status}
                  isPast={isPast}
                  feedbackRating={interview.feedbackRating}
                  href={`${hrefBase}/${interview.applicationId}`}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
