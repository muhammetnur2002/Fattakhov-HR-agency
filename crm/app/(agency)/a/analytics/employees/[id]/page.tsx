import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalBadge } from "@/components/analytics/employee-table";
import { StatCard } from "@/components/shell/stat-card";
import { BackLink } from "@/components/ui/back-link";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { AccessDeniedError } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/labels";
import {
  employeeVacancies,
  getEmployeeStats,
} from "@/lib/services/analytics/employees";
import { defaultPeriod } from "@/lib/services/analytics/queries";

export const metadata = { title: "Аналитика сотрудника" };

const RANGES = { month: 30, quarter: 90, year: 365 } as const;
type RangeKey = keyof typeof RANGES;
const RANGE_LABELS: Record<RangeKey, string> = {
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
};

export default async function EmployeeAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "analytics.employee");

  const { id } = await params;
  const { range } = await searchParams;
  const key: RangeKey = range === "month" || range === "year" ? range : "quarter";

  let stats;
  let vacancies;
  try {
    stats = await getEmployeeStats(actor, id, defaultPeriod(RANGES[key]));
    vacancies = stats ? await employeeVacancies(actor, id) : [];
  } catch (error) {
    // Чужая страница для рекрутёра — как несуществующая
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  if (!stats) notFound();

  const backHref =
    actor.role === "OWNER" || actor.role === "HEAD"
      ? `/a/analytics?range=${key}`
      : "/a";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex">
          <BackLink href={backHref} className="mb-0">
            {backHref === "/a" ? "На главную" : "К аналитике"}
          </BackLink>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PageTitle>{stats.fullName}</PageTitle>
          <FinalBadge finalists={stats.finalists} />
        </div>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABELS[stats.role]}
          {stats.position ? ` · ${stats.position}` : ""}
        </p>
      </div>

      <FilterChipGroup label="Период">
        {(Object.keys(RANGES) as RangeKey[]).map((r) => (
          <FilterChip key={r} href={`/a/analytics/employees/${stats.id}?range=${r}`} selected={key === r}>
            {RANGE_LABELS[r]}
          </FilterChip>
        ))}
      </FilterChipGroup>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Вакансий в работе" value={stats.activeVacancies} hint="активные, где он назначен" />
        <StatCard label="Кандидатов в работе" value={stats.activeCandidates} hint="ведёт сейчас" />
        <StatCard label="Добавил в базу" value={stats.candidatesAdded} hint="за выбранный период" />
        <StatCard label="Представил клиентам" value={stats.presented} hint="за выбранный период" />
        <StatCard
          label="Качество представлений"
          value={stats.quality === null ? "—" : `${stats.quality}%`}
          hint="доля дошедших до интервью"
        />
        <StatCard label="Нанято" value={stats.hired} hint="за выбранный период" />
        <StatCard
          label="Заданий открыто"
          value={stats.tasksOpen}
          hint={stats.tasksOverdue > 0 ? `просрочено: ${stats.tasksOverdue}` : "просрочек нет"}
          accent={stats.tasksOverdue > 0}
        />
        <StatCard label="Заданий выполнено" value={stats.tasksDone} hint="за выбранный период" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Финалисты</CardTitle>
          <CardDescription>Кандидаты сотрудника на этапе «Финал».</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.finalists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сейчас никого на финале.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {stats.finalists.map((f) => (
                <li key={f.applicationId}>
                  <Link href={`/a/candidates/${f.candidateId}`} className="font-medium hover:underline">
                    {f.fullName}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · №{f.vacancyNumber} {f.vacancyTitle}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Вакансии</CardTitle>
        </CardHeader>
        <CardContent>
          {vacancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">Активных вакансий нет.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {vacancies.map((v) => (
                <li key={v.id}>
                  <Link href={`/a/vacancies/${v.id}`} className="font-medium hover:underline">
                    №{v.number} {v.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {v.clientName} · в работе {v.inWork}, представлено {v.presented}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
