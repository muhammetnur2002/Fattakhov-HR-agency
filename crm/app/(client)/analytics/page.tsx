import { FileText } from "lucide-react";
import Link from "next/link";

import { FunnelChart } from "@/components/analytics/funnel-chart";
import { RejectionChart } from "@/components/analytics/rejection-chart";
import { StatCard, StatRow } from "@/components/shell/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireClientActor } from "@/lib/auth/session";
import {
  clientAnalytics,
  defaultPeriod,
} from "@/lib/services/analytics/queries";

export const metadata = { title: "Аналитика" };

const RANGES = { month: 30, quarter: 90, year: 365 } as const;
type RangeKey = keyof typeof RANGES;

export default async function ClientAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireClientActor();
  authorize(actor, "analytics.client", { clientId: actor.clientId });

  const { range } = await searchParams;
  const key: RangeKey =
    range === "month" || range === "year" ? range : "quarter";

  const period = defaultPeriod(RANGES[key]);
  const data = await clientAnalytics(actor, period);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Аналитика</h1>
          <p className="text-sm text-muted-foreground">
            Что происходит по вашим вакансиям и сколько это занимает
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/reports/client?range=${key}`}>
            <FileText className="size-4" />
            Выгрузить отчёт
          </a>
        </Button>
      </div>

      <div className="flex gap-2">
        {(Object.keys(RANGES) as RangeKey[]).map((r) => (
          <Button
            key={r}
            asChild
            size="sm"
            variant={key === r ? "default" : "outline"}
          >
            <Link href={`/analytics?range=${r}`}>
              {r === "month" ? "Месяц" : r === "quarter" ? "Квартал" : "Год"}
            </Link>
          </Button>
        ))}
      </div>

      {/* Та же StatRow, что на дашборде — россыпь одинаковых по смыслу
          цифр без общей рамки читалась как другой экран другого продукта */}
      <StatRow>
        <StatCard label="Кандидатов в работе" value={data.inProgress} />
        <StatCard
          label="Представлено за период"
          value={data.presentedInPeriod}
        />
        <StatCard
          label="Время до первого кандидата"
          value={data.daysToFirstCandidate ?? "—"}
          hint={data.daysToFirstCandidate !== null ? "дней, медиана" : undefined}
        />
        <StatCard
          label="Срок закрытия"
          value={data.timeToHire ?? "—"}
          hint={data.timeToHire !== null ? "дней от запуска до выхода" : undefined}
        />
      </StatRow>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Воронка</CardTitle>
          <CardDescription>
            Сколько кандидатов дошло до каждого этапа и где теряется больше
            всего.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelChart steps={data.funnel} />
        </CardContent>
      </Card>

      {/* Блок, ради которого аналитика и нужна клиенту: он видит только
          представленных, а до них была работа, за которую он платит */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Работа за период</CardTitle>
          <CardDescription>
            До каждого показанного вам кандидата стоят просмотренные
            и отсеянные.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              value={data.agencyWork.screened}
              label="кандидатов взято в работу"
            />
            <Metric value={data.agencyWork.presented} label="представлено вам" />
            <Metric
              value={data.agencyWork.interviewed}
              label="интервью проведено"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Почему отказываете</CardTitle>
            <CardDescription>
              По этим причинам рекрутер калибрует поиск.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectionChart rejections={data.rejections} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Скорость решений</CardTitle>
            <CardDescription>
              Сколько в среднем кандидат ждёт вашей реакции.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.avgDecisionHours === null ? (
              <p className="text-sm text-muted-foreground">
                Пока не по чему считать.
              </p>
            ) : (
              <div>
                <div className="text-3xl font-semibold tabular-nums">
                  {Math.round(data.avgDecisionHours)}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  рабочих часов в среднем. Считаем по рабочему графику:
                  выходные и ночь не в счёт.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
