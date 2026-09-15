import { redirect } from "next/navigation";

import { TariffPicker } from "@/components/onboarding/tariff-picker";
import { Card, CardContent } from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hasAgreement } from "@/lib/services/agreements";

export const metadata = { title: "Условия сотрудничества" };

export default async function OnboardingPage() {
  const actor = await requireClientActor();
  if (!actor.clientId) redirect("/dashboard");

  // Условия уже есть — в онбординге делать нечего
  if (await hasAgreement(actor.clientId)) redirect("/dashboard");

  const client = await prisma.client.findFirst({
    where: { id: actor.clientId },
    select: { name: true },
  });

  // Выбирает подписант. Остальным показываем, чего ждать, а не пустой экран.
  if (!canDo(actor, "agreement.accept", { clientId: actor.clientId })) {
    return (
      <Card>
        <CardContent className="space-y-2 p-8 text-center">
          <h1 className="text-2xl font-semibold">Условия ещё не выбраны</h1>
          <p className="text-sm text-muted-foreground">
            Администратор вашей компании должен выбрать условия сотрудничества.
            После этого кабинет откроется — вы увидите вакансии и кандидатов.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Добро пожаловать{client?.name ? `, ${client.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Осталось выбрать, как мы работаем и как считается вознаграждение.
          Это займёт минуту, потом можно отправлять первую заявку на подбор.
        </p>
      </div>

      <TariffPicker />
    </div>
  );
}
