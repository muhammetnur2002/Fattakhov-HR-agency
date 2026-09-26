import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceUnavailable } from "../service-unavailable";
import { StatCard, StatRow } from "@/components/shell/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { fetchPilotMetrics, StudentsServiceError } from "@/lib/students-service";

export const metadata = { title: "Метрики пилота" };

export default async function PilotReviewPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.pilot")) notFound();

  let m;
  try {
    m = await fetchPilotMetrics();
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return (
      <div className="space-y-6">
        <Header />
        <ServiceUnavailable message={error.message} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Студенты</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <StatRow>
            <StatCard label="Зарегистрировано" value={m.students.registered} />
            <StatCard label="Заполнили профиль" value={m.students.completedProfile} />
            <StatCard label="Откликнулись хотя бы раз" value={m.students.applied} />
            <StatCard label="Получили предложение" value={m.students.gotOpportunity} accent />
            <StatCard label="Учёба подтверждена" value={m.students.verified} />
          </StatRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Компании</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <StatRow>
            <StatCard label="Всего" value={m.companies.total} />
            <StatCard label="Зарегистрировались сами" value={m.companies.selfRegistered} />
            <StatCard label="Одобрены" value={m.companies.approved} />
            <StatCard label="С опубликованной вакансией" value={m.companies.withPublishedVacancy} />
          </StatRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Вакансии и отклики</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <StatRow>
            <StatCard label="Вакансий опубликовано" value={m.vacancies.published} />
            <StatCard label="Из них из кабинета компании" value={m.vacancies.fromCabinet} />
            <StatCard label="Просмотров профилей" value={m.profileViews} />
            <StatCard label="Откликов всего" value={m.applications.total} />
            <StatCard label="Просмотрены работодателем" value={m.applications.viewed} />
            <StatCard label="Дошли до следующего шага" value={m.applications.nextStep} />
            <StatCard label="Наняты" value={m.applications.hired} accent />
          </StatRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Скорость</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <StatRow>
            <StatCard
              label="До первого отклика"
              value={m.timing.firstApplicationHours ?? "—"}
              hint="часов, медиана"
            />
            <StatCard
              label="До первого предложения"
              value={m.timing.firstOpportunityDays ?? "—"}
              hint="дней, медиана"
            />
          </StatRow>
        </CardContent>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/reviews">← Проверки</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Метрики пилота</h1>
        <p className="text-sm text-muted-foreground">
          Числа со студенческой платформы: регистрации, отклики, публикации, конверсии.
        </p>
      </div>
    </>
  );
}
