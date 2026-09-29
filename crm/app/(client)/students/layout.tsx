import { StudentsIntro } from "@/components/client/students-intro";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getActiveAgreement } from "@/lib/services/agreements";
import { fetchStudentsSummary } from "@/lib/students-service";
import { StudentsTabs } from "./students-tabs";

export default async function StudentsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireClientActor();
  // Значки на вкладках: если платформа не ответила — вкладки просто без чисел
  const summary = actor.clientId ? await fetchStudentsSummary(actor.clientId) : null;
  // С договором вакансии публикуются сразу, без проверки — объяснение это учитывает
  const [agreement, client] = actor.clientId
    ? await Promise.all([
        getActiveAgreement(actor.clientId),
        prisma.client.findFirst({ where: { id: actor.clientId }, select: { status: true } }),
      ])
    : [null, null];
  const contracted = Boolean(agreement) || client?.status === "ACTIVE";

  return (
    <div className="space-y-5">
      <StudentsIntro contracted={contracted} />
      <StudentsTabs
        newApplications={summary?.newApplications ?? 0}
        unreadMessages={summary?.unreadMessages ?? 0}
      />
      {children}
    </div>
  );
}
