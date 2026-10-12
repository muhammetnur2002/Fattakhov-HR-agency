import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createVacancyAction } from "../actions";
import { VacancyForm } from "../vacancy-form";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Новая вакансия" };

export default async function NewStudentsVacancyPage() {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  const client = await prisma.client.findFirst({ where: { id: actor.clientId }, select: { status: true } });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href="/students">Все вакансии</BackLink>
        <PageTitle>Новая вакансия</PageTitle>
      </div>
      <VacancyForm action={createVacancyAction} skipsModeration={client?.status === "ACTIVE"} />
    </div>
  );
}
