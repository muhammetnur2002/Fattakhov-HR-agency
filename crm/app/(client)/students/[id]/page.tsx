import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fetchEmployerVacancy, StudentsServiceError } from "@/lib/students-service";
import { updateVacancyAction } from "../actions";
import { VacancyActions } from "../vacancy-actions";
import { VacancyForm } from "../vacancy-form";

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
      <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Все вакансии
      </Link>
      <h1 className="text-2xl font-semibold">{vacancy.title}</h1>
      <VacancyForm
        action={updateVacancyAction.bind(null, id)}
        initial={vacancy}
        skipsModeration={client?.status === "ACTIVE"}
      />
      <VacancyActions id={id} status={vacancy.status} />
    </div>
  );
}
