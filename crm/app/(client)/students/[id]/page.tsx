import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fetchEmployerVacancy, StudentsServiceError } from "@/lib/students-service";
import { updateVacancyAction } from "../actions";
import { VacancyActions } from "../vacancy-actions";
import { VacancyForm } from "../vacancy-form";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Вакансия" };

type Props = { params: Promise<{ id: string }> };

export default async function StudentsVacancyPage({ params }: Props) {
  const { id } = await params;
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  const client = await prisma.client.findFirst({ where: { id: actor.clientId }, select: { status: true } });

  let vacancy;
  try {
    vacancy = await fetchEmployerVacancy(actor.clientId, id);
  } catch (err) {
    return (
      <div className="max-w-3xl">
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить вакансию</AlertTitle>
          <AlertDescription>
            {err instanceof StudentsServiceError ? err.message : "Студенческая платформа недоступна"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!vacancy) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href="/students">Все вакансии</BackLink>
        <PageTitle>{vacancy.title}</PageTitle>
      </div>
      <VacancyForm
        action={updateVacancyAction.bind(null, id)}
        initial={vacancy}
        skipsModeration={client?.status === "ACTIVE"}
      />
      <VacancyActions id={id} status={vacancy.status} />
    </div>
  );
}
