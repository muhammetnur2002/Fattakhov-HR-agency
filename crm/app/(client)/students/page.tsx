import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { ClearClosed } from "./clear-closed";
import {
  fetchEmployerVacancies,
  StudentsServiceError,
  type EmployerVacancyDTO,
  type StudentsVacancyStatus,
} from "@/lib/students-service";

export const metadata = { title: "Студенческая платформа" };

const STATUS_LABEL: Record<StudentsVacancyStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На проверке",
  PUBLISHED: "Опубликована",
  REJECTED: "Отклонена",
  CLOSED: "Снята",
};

const STATUS_VARIANT: Record<StudentsVacancyStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  PENDING: "secondary",
  PUBLISHED: "default",
  REJECTED: "destructive",
  CLOSED: "outline",
};

/**
 * Вакансии клиента на студенческой платформе — прямо в CRM, без перехода
 * на другой сайт (было: кнопка-редирект, app/(client)/students/open/route.ts).
 * Данные и правила берутся служебным вызовом (lib/students-service.ts),
 * клиент своей сессией на ту платформу не заходит.
 */
export default async function StudentsVacanciesPage() {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  let vacancies: EmployerVacancyDTO[] = [];
  let error: string | null = null;
  try {
    vacancies = await fetchEmployerVacancies(actor.clientId);
  } catch (err) {
    error = err instanceof StudentsServiceError ? err.message : "Не удалось загрузить вакансии";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Студенческая платформа</h1>
          <p className="text-sm text-muted-foreground">
            Вакансии для подработки — студенты откликаются сами, без поиска от агентства.
          </p>
        </div>
        <Button asChild>
          <Link href="/students/new">
            <Plus />
            Новая вакансия
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && vacancies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Вакансий пока нет — создайте первую.
          </CardContent>
        </Card>
      )}

      {/* Из CRM-вакансий (fromCrm) удалить нельзя — их ведёт агентство */}
      {(() => {
        const ids = vacancies
          .filter((v) => !v.fromCrm && ["CLOSED", "REJECTED"].includes(v.status))
          .map((v) => v.id);
        return ids.length > 0 ? <ClearClosed ids={ids} /> : null;
      })()}

      <div className="grid gap-3">
        {vacancies.map((vacancy) => {
          const card = (
            <Card
              className={
                vacancy.fromCrm ? undefined : "transition-colors hover:border-primary/40 cursor-pointer"
              }
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{vacancy.title}</span>
                    {vacancy.fromCrm && <Badge variant="outline">Из CRM</Badge>}
                    <Badge variant={STATUS_VARIANT[vacancy.status]}>{STATUS_LABEL[vacancy.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {vacancy.city} · откликов: {vacancy.applications}
                  </p>
                  {vacancy.moderationNote && (
                    <p className="text-sm text-destructive">Причина: {vacancy.moderationNote}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          return vacancy.fromCrm ? (
            <div key={vacancy.id}>{card}</div>
          ) : (
            <Link key={vacancy.id} href={`/students/${vacancy.id}`}>
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
