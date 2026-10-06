import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, requireClientActor } from "@/lib/auth/session";
import {
  CandidatesLockedError,
  fetchEmployerVacancies,
  fetchStudentCandidates,
  StudentsServiceError,
  type EmployerVacancyDTO,
  type StudentCandidate,
} from "@/lib/students-service";
import { cn } from "@/lib/utils";
import { CandidatesList } from "./candidates-list";

export const metadata = { title: "Поиск студентов" };

/**
 * Поиск студентов под вакансию — список с поиском и фильтрами, тут же в CRM.
 * Показываются подтверждённые студенты, которые ещё не откликались на эту
 * вакансию; контакты закрыты, пока студент не откликнется сам.
 */
export default async function StudentsCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ vacancy?: string }>;
}) {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  const { vacancy: requested } = await searchParams;

  let vacancies: EmployerVacancyDTO[] = [];
  let candidates: StudentCandidate[] = [];
  let error: string | null = null;
  let locked = false;
  let selected: EmployerVacancyDTO | null = null;
  try {
    // Приглашать можно только на опубликованную вакансию своего кабинета
    vacancies = (await fetchEmployerVacancies(actor.clientId)).filter((v) => v.status === "PUBLISHED" && !v.fromCrm);
    selected = vacancies.find((v) => v.id === requested) ?? vacancies[0] ?? null;
    if (selected) {
      const result = await fetchStudentCandidates(actor.clientId, selected.id);
      candidates = result?.candidates ?? [];
    }
  } catch (err) {
    if (err instanceof CandidatesLockedError) {
      locked = true;
      selected = null;
    } else {
      error = err instanceof StudentsServiceError ? err.message : "Не удалось загрузить кандидатов";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Поиск студентов</h1>
        <p className="text-sm text-muted-foreground">
          Подтверждённые студенты, которые ещё не откликались на выбранную вакансию. Найдите подходящего и пригласите.
        </p>
      </div>

      {locked && (
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Поиск студентов откроется после договора</p>
            <p>
              Анкеты студентов доступны компаниям, которые заключили договор с агентством.{" "}
              <Link href="/documents" className="underline underline-offset-4">
                Договор — в «Документах»
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {error && !locked && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && !locked && vacancies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Чтобы искать студентов, сначала опубликуйте вакансию.
          </CardContent>
        </Card>
      )}

      {selected && (
        <>
          <div className="pill-scroller flex gap-2">
            {vacancies.map((v) => (
              <Link
                key={v.id}
                href={`/students/candidates?vacancy=${v.id}`}
                aria-current={v.id === selected.id ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  v.id === selected.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {v.title}
              </Link>
            ))}
          </div>
          <CandidatesList key={selected.id} vacancyId={selected.id} candidates={candidates} />
        </>
      )}
    </div>
  );
}
