import { FileText } from "lucide-react";
import Link from "next/link";

import { FunnelChart } from "@/components/analytics/funnel-chart";
import { RejectionChart } from "@/components/analytics/rejection-chart";
import { StatCard } from "@/components/shell/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import {
  agencyAnalytics,
  defaultPeriod,
} from "@/lib/services/analytics/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Аналитика" };

const RANGES = { month: 30, quarter: 90, year: 365 } as const;
type RangeKey = keyof typeof RANGES;

export default async function AgencyAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "analytics.agency");

  const { range } = await searchParams;
  const key: RangeKey =
    range === "month" || range === "year" ? range : "quarter";

  const data = await agencyAnalytics(actor, defaultPeriod(RANGES[key]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Аналитика</h1>
          <p className="text-sm text-muted-foreground">
            Загрузка команды, скорость и качество подбора
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/reports/agency?range=${key}`}>
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
            <Link href={`/a/analytics?range=${r}`}>
              {r === "month" ? "Месяц" : r === "quarter" ? "Квартал" : "Год"}
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="До первого кандидата"
          value={data.medianDaysToFirstPresentation ?? "—"}
          hint="дней, медиана по запущенным вакансиям"
        />
        <StatCard
          label="Вакансий в риске"
          value={data.vacanciesAtRisk.length}
          hint="долго без движения"
          accent
        />
        <StatCard
          label="Просрочек у клиента"
          value={data.overdueDecisions}
          hint="кандидаты ждут решения дольше норматива"
          accent
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Воронка по агентству</CardTitle>
          <CardDescription>
            Включая внутренние этапы — клиент видит только с «Представлен».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelChart steps={data.funnel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Загрузка команды</CardTitle>
          <CardDescription>
            Качество — доля представленных, дошедших до интервью. Низкое
            означает, что клиента заваливают нерелевантными.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.load.length === 0 ? (
            <p className="text-sm text-muted-foreground">Рекрутеров нет.</p>
          ) : (
            <div className="space-y-2 overflow-x-auto">
              {/* minmax вместо 1fr: на узком экране остальные четыре
                  колонки — все auto, то есть по своему полному размеру —
                  забирали всё место контейнера и не оставляли имени
                  ничего, оно схлопывалось до нулевой ширины и пропадало
                  из виду. Пол в 8rem держит имя читаемым, а если после
                  этого строка всё равно не помещается — прокручиваем
                  вбок всей таблицей, не давя по отдельности */}
              <div className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] gap-x-4 border-b pb-2 text-xs text-muted-foreground">
                <div>Рекрутер</div>
                <div className="w-20 text-right">Вакансий</div>
                <div className="w-20 text-right">В работе</div>
                <div className="w-24 text-right">Представил</div>
                <div className="w-20 text-right">Качество</div>
              </div>
              {data.load.map((item) => (
                <Link
                  key={item.recruiterId}
                  href={`/a/vacancies?recruiterId=${item.recruiterId}`}
                  className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto_auto] items-center gap-x-4 rounded-sm py-0.5 text-sm hover:bg-muted"
                >
                  <div className="truncate">{item.fullName}</div>
                  <div className="w-20 text-right tabular-nums">
                    {item.activeVacancies}
                  </div>
                  <div className="w-20 text-right tabular-nums">
                    {item.activeCandidates}
                  </div>
                  <div className="w-24 text-right tabular-nums">
                    {item.presented}
                  </div>
                  <div
                    className={cn(
                      "w-20 text-right tabular-nums",
                      item.quality !== null &&
                        item.quality < 40 &&
                        "font-medium text-destructive",
                    )}
                  >
                    {item.quality === null ? "—" : `${item.quality}%`}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Вакансии в риске</CardTitle>
            <CardDescription>
              Долго без движения — здесь проблема видна раньше, чем её
              заметит клиент.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.vacanciesAtRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Все вакансии движутся.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.vacanciesAtRisk.map((vacancy) => (
                  <li key={vacancy.id} className="text-sm">
                    <Link
                      href={`/a/vacancies/${vacancy.id}`}
                      className="font-medium hover:underline"
                    >
                      №{vacancy.number} {vacancy.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {/* Кто ведёт — иначе «вакансия стоит» остаётся
                          наблюдением, а не поводом с кем-то поговорить */}
                      {[vacancy.clientName, vacancy.leadRecruiterName ?? "ведущий не назначен"].join(" · ")}
                      <Badge variant="outline">{vacancy.reason}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Причины отказов клиентов</CardTitle>
            <CardDescription>
              Перекос в одну причину — сигнал, что бриф расходится
              с реальностью.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectionChart rejections={data.rejectionsByClient} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
