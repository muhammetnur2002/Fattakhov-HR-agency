import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createVacancyAction } from "../actions";
import { VacancyForm } from "../vacancy-form";

export const metadata = { title: "Новая вакансия" };

export default async function NewStudentsVacancyPage() {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return null;

  const client = await prisma.client.findFirst({ where: { id: actor.clientId }, select: { status: true } });

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Все вакансии
      </Link>
      <h1 className="text-2xl font-semibold">Новая вакансия</h1>
      <VacancyForm action={createVacancyAction} skipsModeration={client?.status === "ACTIVE"} />
    </div>
  );
}
