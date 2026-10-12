import { notFound } from "next/navigation";

import { CandidateEditForm, type ProfileValues } from "@/components/candidates/candidate-edit-form";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { getCandidate } from "@/lib/services/candidates";
import { isSourcingLead } from "@/lib/sourcing";

export const metadata = { title: "Правка профиля кандидата" };

/**
 * Правка профиля кандидата сотрудником агентства.
 *
 * Раньше профиль только читался, а исправить опечатку в телефоне или
 * обновить зарплатные ожидания после разговора было негде. Страница
 * открывает все поля профиля; кандидату без согласия (сорсинг-лид)
 * доступны только имя и контакты.
 */
export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  authorize(actor, "application.viewInternal");

  const candidate = await getCandidate(actor, id);
  if (!candidate) notFound();

  const values: ProfileValues = {
    fullName: candidate.fullName,
    phone: candidate.phone ?? "",
    email: candidate.email ?? "",
    telegram: candidate.telegram ?? "",
    city: candidate.city ?? "",
    totalExperienceYears:
      candidate.totalExperienceYears == null ? "" : String(Number(candidate.totalExperienceYears)),
    currentPosition: candidate.currentPosition ?? "",
    currentCompany: candidate.currentCompany ?? "",
    salaryExpectation:
      candidate.salaryExpectation == null ? "" : String(Number(candidate.salaryExpectation)),
    skills: candidate.skills.join(", "),
    education: candidate.education ?? "",
    summary: candidate.summary ?? "",
  };

  const back = `/a/candidates/${candidate.id}`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href={back}>К карточке</BackLink>
        <PageTitle>Профиль: {candidate.fullName}</PageTitle>
        <p className="text-sm text-muted-foreground">
          Очищенное поле стирается. В журнал попадает только то, какие поля изменены.
        </p>
      </div>

      <CandidateEditForm
        candidateId={candidate.id}
        initialValues={values}
        restricted={isSourcingLead(candidate)}
        backHref={back}
      />
    </div>
  );
}
