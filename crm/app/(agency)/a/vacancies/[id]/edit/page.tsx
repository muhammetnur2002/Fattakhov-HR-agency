import { notFound } from "next/navigation";

import { BriefEditForm, type BriefValues } from "@/components/vacancies/brief-edit-form";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getVacancy } from "@/lib/services/vacancies";

export const metadata = { title: "Правка брифа" };

/**
 * Правка брифа сотрудником агентства.
 *
 * Клиент правит бриф сам, пока заявка не в работе (BR-21). Агентству нужна
 * правка и после запуска: уточнение по телефону, поправленные требования.
 * Каждая правка пишется в журнал, а клиент получает уведомление.
 */
export default async function AgencyEditBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();

  const vacancy = await getVacancy(actor, id);
  if (!vacancy) notFound();
  authorize(actor, "vacancy.editBrief", {
    clientId: vacancy.clientId,
    hiringManagerId: vacancy.hiringManagerId,
  });
  // Закрытую вакансию править незачем: бриф уже ничего не определяет
  if (vacancy.status.startsWith("CLOSED_")) notFound();

  const hiringManagers = await prisma.user.findMany({
    where: {
      clientId: vacancy.clientId,
      role: { in: ["CLIENT_HIRING", "CLIENT_ADMIN"] },
      isActive: true,
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href={`/a/vacancies/${vacancy.id}?tab=brief`}>К вакансии</BackLink>
        <PageTitle>
          Бриф №{vacancy.number}: {vacancy.title}
        </PageTitle>
        <p className="text-sm text-muted-foreground">
          Изменения сохраняются в журнале, клиент получит уведомление.
        </p>
      </div>

      <BriefEditForm
        vacancyId={vacancy.id}
        initialValues={toValues(vacancy)}
        hiringManagers={hiringManagers}
        backHref={`/a/vacancies/${vacancy.id}?tab=brief`}
      />
    </div>
  );
}

/** Модель → строки формы: в инпутах живут строки, а не Decimal и Date. */
function toValues(v: {
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
}): BriefValues {
  return {
    title: v.title,
    department: v.department ?? "",
    hiringManagerId: v.hiringManagerId ?? "",
    headcount: String(v.headcount),
    reasonForHire: v.reasonForHire ?? "",
    urgency: v.urgency,
    desiredStartDate: v.desiredStartDate ? new Date(v.desiredStartDate).toISOString().slice(0, 10) : "",
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
