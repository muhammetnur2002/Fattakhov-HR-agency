import Link from "next/link";
import { notFound } from "next/navigation";

import {
  VacancyWizard,
  type WizardValues,
} from "@/components/vacancies/vacancy-wizard";
import { Button } from "@/components/ui/button";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getVacancy } from "@/lib/services/vacancies";
import { clientCanEditBrief } from "@/lib/services/vacancy-status";

export const metadata = { title: "Изменение заявки" };

export default async function EditVacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireClientActor();

  const vacancy = await getVacancy(actor, id);
  if (!vacancy) notFound();

  authorize(actor, "vacancy.editBrief", {
    clientId: vacancy.clientId,
    hiringManagerId: vacancy.hiringManagerId,
  });

  // BR-21: после запуска в работу бриф правится только через обсуждение
  if (!clientCanEditBrief(vacancy.status)) notFound();

  const hiringManagers = await prisma.user.findMany({
    where: {
      clientId: actor.clientId ?? "",
      role: { in: ["CLIENT_HIRING", "CLIENT_ADMIN"] },
      isActive: true,
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/vacancies/${vacancy.id}`}>← К вакансии</Link>
        </Button>
        <h1 className="text-2xl font-semibold">
          Заявка №{vacancy.number}: {vacancy.title}
        </h1>
      </div>

      <VacancyWizard
        hiringManagers={hiringManagers}
        initialVacancyId={vacancy.id}
        initialValues={toWizardValues(vacancy)}
      />
    </div>
  );
}

/** Модель → строковые значения формы: в инпутах живут строки, а не Decimal и Date. */
function toWizardValues(v: {
  title: string;
  department: string | null;
  hiringManagerId: string | null;
  headcount: number;
  reasonForHire: string | null;
  urgency: string;
  desiredStartDate: Date | null;
  responsibilities: string | null;
  requirements: string | null;
  niceToHave: string | null;
  stopFactors: string | null;
  targetCompanies: string | null;
  salaryFrom: unknown;
  salaryTo: unknown;
  salaryGross: boolean;
  bonusScheme: string | null;
  city: string | null;
  workFormat: string | null;
  employmentType: string | null;
  workSchedule: string | null;
  conditions: string | null;
  interviewStages: string | null;
}): Partial<WizardValues> {
  return {
    title: v.title,
    department: v.department ?? "",
    hiringManagerId: v.hiringManagerId ?? "",
    headcount: String(v.headcount),
    reasonForHire: v.reasonForHire ?? "",
    urgency: v.urgency,
    desiredStartDate: v.desiredStartDate
      ? v.desiredStartDate.toISOString().slice(0, 10)
      : "",
    responsibilities: v.responsibilities ?? "",
    requirements: v.requirements ?? "",
    niceToHave: v.niceToHave ?? "",
    stopFactors: v.stopFactors ?? "",
    targetCompanies: v.targetCompanies ?? "",
    salaryFrom: v.salaryFrom == null ? "" : String(Number(v.salaryFrom)),
    salaryTo: v.salaryTo == null ? "" : String(Number(v.salaryTo)),
    salaryGross: String(v.salaryGross),
    bonusScheme: v.bonusScheme ?? "",
    city: v.city ?? "",
    workFormat: v.workFormat ?? "",
    employmentType: v.employmentType ?? "",
    workSchedule: v.workSchedule ?? "",
    conditions: v.conditions ?? "",
    interviewStages: v.interviewStages ?? "",
  };
}
