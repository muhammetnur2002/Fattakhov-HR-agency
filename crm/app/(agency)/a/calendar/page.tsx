import Link from "next/link";

import { CalendarSubscription } from "@/components/interviews/calendar-subscription";
import { CalendarView } from "@/components/interviews/calendar-view";
import { Button } from "@/components/ui/button";
import { canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { calendarTokenFor } from "@/lib/calendar/ical";
import {
  listInterviews,
  listUnratedInterviews,
} from "@/lib/services/interviews";
import { appOrigin } from "@/lib/urls";

export const metadata = { title: "Календарь" };

/** Сколько дней показывать. Неделя по умолчанию — это рабочий горизонт. */
const RANGES = { week: 7, month: 30, quarter: 90 } as const;
type RangeKey = keyof typeof RANGES;

export default async function AgencyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { range } = await searchParams;
  const key: RangeKey = range === "month" || range === "quarter" ? range : "week";

  // Часы спрашиваем один раз на страницу и передаём вниз: строки списка
  // должны сравниваться с одним моментом, а не каждая со своим
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + RANGES[key]);

  // Неделя назад: встречи, которые прошли и не получили оценки. Календарь
  // смотрит вперёд, и без этого блока такая задача не видна нигде
  const feedbackSince = new Date(from);
  feedbackSince.setDate(feedbackSince.getDate() - 7);

  const canManageInterviews = canDo(actor, "interview.proposeSlots");

  const [interviews, needFeedback] = await Promise.all([
    listInterviews(actor, { from, to }),
    canManageInterviews
      ? listUnratedInterviews(actor, feedbackSince)
      : Promise.resolve([]),
  ]);

  const baseUrl = appOrigin();
  const feedUrl = `${baseUrl}/api/calendar/${calendarTokenFor(actor.id)}.ics`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Календарь</h1>
          <p className="text-sm text-muted-foreground">
            Интервью и встречи, ждущие согласования времени
          </p>
        </div>
        <CalendarSubscription url={feedUrl} />
      </div>

      <div className="flex gap-2">
        {(Object.keys(RANGES) as RangeKey[]).map((r) => (
          <Button
            key={r}
            asChild
            size="sm"
            variant={key === r ? "default" : "outline"}
          >
            <Link href={`/a/calendar?range=${r}`}>
              {r === "week" ? "Неделя" : r === "month" ? "Месяц" : "Квартал"}
            </Link>
          </Button>
        ))}
      </div>

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
