import Link from "next/link";

import { CalendarSubscription } from "@/components/interviews/calendar-subscription";
import { CalendarView } from "@/components/interviews/calendar-view";
import { Button } from "@/components/ui/button";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { calendarTokenFor } from "@/lib/calendar/ical";
import { listInterviews } from "@/lib/services/interviews";
import { appOrigin } from "@/lib/urls";

export const metadata = { title: "Календарь" };

const RANGES = { week: 7, month: 30, quarter: 90 } as const;
type RangeKey = keyof typeof RANGES;

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireClientActor();
  const { range } = await searchParams;
  const key: RangeKey = range === "month" || range === "quarter" ? range : "week";

  // Часы спрашиваем один раз на страницу — см. CalendarView
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + RANGES[key]);

  // Фильтр по видимости вакансий внутри listInterviews: чужих встреч
  // клиент не увидит даже теоретически
  const interviews = await listInterviews(actor, { from, to });

  const baseUrl = appOrigin();
  const feedUrl = `${baseUrl}/api/calendar/${calendarTokenFor(actor.id)}.ics`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Календарь</h1>
          <p className="text-sm text-muted-foreground">
            Ваши интервью с кандидатами
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
            <Link href={`/calendar?range=${r}`}>
              {r === "week" ? "Неделя" : r === "month" ? "Месяц" : "Квартал"}
            </Link>
          </Button>
        ))}
      </div>

      <CalendarView
        interviews={interviews}
        hrefBase="/applications"
        // Просьба перенести встречу — это участие в согласовании
        // времени, то есть ровно interview.confirm: наблюдатель встречи
        // видит, но во времени не участвует. Само подтверждение слота
        // делает кандидат по токен-ссылке (/schedule/[token]), там
        // проверять права не у кого — но со стороны кабинета правило
        // именно это, и держать его стоит одной строкой матрицы,
        // а не именами ролей в коде страницы.
        //
        // clientId без hiringManagerId — проверка «на уровне роли»,
        // не по конкретной вакансии (ownHiring отдаёт true для такого
        // subject); список внизу и так отфильтрован по видимости
        // в listInterviews, так что per-строчная проверка тут лишняя.
        canRequestReschedule={canDo(actor, "interview.confirm", {
          clientId: actor.clientId,
        })}
        now={now.getTime()}
      />
    </div>
  );
}
