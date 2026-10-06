import Link from "next/link";

import { StudentsIntro } from "@/components/client/students-intro";
import { StudentsNudge } from "@/components/client/students-nudge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TELEGRAM_HREF } from "@/lib/contacts";
import { nudgeFor } from "@/lib/students-funnel";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getActiveAgreement } from "@/lib/services/agreements";
import { fetchStudentsSummary, hasStudentsContact } from "@/lib/students-service";
import { StudentsTabs } from "./students-tabs";

export default async function StudentsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireClientActor();

  // Вошедшим по телефону почта для входа не нужна, а
  // платформе нужна: на неё приходят отклики студентов. Заглушку туда
  // не отдаём (см. studentsContact), поэтому сначала — настоящая почта
  if (actor.clientId && !(await hasStudentsContact(actor.clientId))) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Сначала — рабочая почта</CardTitle>
          <CardDescription>
            На неё студенческая платформа присылает отклики и решения по
            вакансиям. Укажите почту в настройках и подтвердите её по ссылке
            из письма — после этого раздел откроется.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings">Указать почту</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

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
  const nudge = nudgeFor(contracted, summary);

  return (
    <div className="space-y-5">
      <StudentsIntro contracted={contracted} />
      {nudge !== "none" && (
        <StudentsNudge kind={nudge} applications={summary?.applications ?? 0} telegramHref={TELEGRAM_HREF} />
      )}
      <StudentsTabs
        newApplications={summary?.newApplications ?? 0}
        unreadMessages={summary?.unreadMessages ?? 0}
      />
      {children}
    </div>
  );
}
