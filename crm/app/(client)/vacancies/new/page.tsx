import Link from "next/link";

import { VacancyWizard } from "@/components/vacancies/vacancy-wizard";
import { Button } from "@/components/ui/button";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Новая заявка" };

export default async function NewVacancyPage() {
  const actor = await requireClientActor();
  authorize(actor, "vacancy.create", { clientId: actor.clientId });

  // Заказчиком может быть тот, кто потом будет смотреть кандидатов
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
          <Link href="/vacancies">← Вакансии</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Заявка на подбор</h1>
        <p className="text-sm text-muted-foreground">
          Чем точнее бриф, тем меньше нерелевантных кандидатов. Черновик
          сохраняется сам — можно прерваться и вернуться.
        </p>
      </div>

      <VacancyWizard hiringManagers={hiringManagers} />
    </div>
  );
}
