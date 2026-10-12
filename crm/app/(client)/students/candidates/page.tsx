import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import {
  CandidatesLockedError,
  fetchEmployerVacancies,
  fetchStudentCandidates,
  StudentsServiceError,
  type EmployerVacancyDTO,
  type StudentCandidate,
} from "@/lib/students-service";
import { CandidatesList } from "./candidates-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { PageTitle } from "@/components/ui/page-title";

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
    <div className="space-y-6">
      <div>
        <PageTitle>Поиск студентов</PageTitle>
        <p className="text-sm text-muted-foreground">
          Подтверждённые студенты, которые ещё не откликались на выбранную вакансию. Найдите подходящего и пригласите.
        </p>
      </div>

      {locked && (
        <EmptyState>
          <p className="font-medium text-foreground">
            Поиск студентов откроется после договора
          </p>
          <p>
            Анкеты студентов доступны компаниям, которые заключили договор с
            агентством.{" "}
            <Link href="/documents" className="underline underline-offset-4">
              Договор — в «Документах»
            </Link>
            .
          </p>
        </EmptyState>
      )}

      {error && !locked && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && !locked && vacancies.length === 0 && (
        <EmptyState>
          Чтобы искать студентов, сначала опубликуйте вакансию.
        </EmptyState>
      )}

      {selected && (
        <>
          <FilterChipGroup label="Вакансия" className="pill-scroller flex-nowrap">
            {vacancies.map((v) => (
              <FilterChip key={v.id} href={`/students/candidates?vacancy=${v.id}`} selected={v.id === selected.id}>
                {v.title}
              </FilterChip>
            ))}
          </FilterChipGroup>
          <CandidatesList key={selected.id} vacancyId={selected.id} candidates={candidates} />
        </>
      )}
    </div>
  );
}
