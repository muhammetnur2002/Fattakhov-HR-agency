
import { QuickAddForm } from "@/components/candidates/quick-add-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Новый кандидат" };

export default async function NewCandidatePage({
  searchParams,
}: {
  searchParams: Promise<{ vacancyId?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "application.create");

  const { vacancyId } = await searchParams;

  // Кандидата могли начать заводить прямо из воронки — тогда покажем,
  // куда он попадёт
  const vacancy = vacancyId
    ? await prisma.vacancy.findFirst({
        where: { id: vacancyId, organizationId: actor.organizationId },
        select: {
          id: true,
          number: true,
          title: true,
          client: { select: { name: true } },
        },
      })
    : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink
          href={vacancy ? `/a/vacancies/${vacancy.id}` : "/a/candidates"}
        >
          {vacancy ? `№${vacancy.number} ${vacancy.title}` : "Кандидаты"}
        </BackLink>
        <PageTitle>Новый кандидат</PageTitle>
        {vacancy && (
          <p className="text-sm text-muted-foreground">
            Попадёт в воронку «{vacancy.title}» ({vacancy.client.name}) на
            первый этап — клиент его пока не увидит.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent>
          <QuickAddForm vacancyId={vacancy?.id} />
        </CardContent>
      </Card>
    </div>
  );
}
