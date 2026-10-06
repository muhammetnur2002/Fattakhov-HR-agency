import { redirect } from "next/navigation";

import { BriefWizard } from "@/components/onboarding/brief-wizard";
import { TariffPicker } from "@/components/onboarding/tariff-picker";
import { Card, CardContent } from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isDeliverableEmail } from "@/lib/notifications/deliverable";
import { hasAgreement } from "@/lib/services/agreements";
import { isPlaceholderName, needsBrief } from "@/lib/services/registration";

export const metadata = { title: "Начало работы" };

export default async function OnboardingPage() {
  const actor = await requireClientActor();
  if (!actor.clientId) redirect("/dashboard");

  const client = await prisma.client.findFirst({
    where: { id: actor.clientId },
    select: { name: true, selfRegisteredAt: true, briefCompletedAt: true },
  });

  /*
    Сначала анкета: самостоятельно зарегистрировавшиеся попадают сюда
    сразу после входа — любым из способов: телефон, почта, —
    кабинет уводит их сюда сам (app/(client)/layout.tsx). Заведённых
    агентством анкета не касается: их данные вносит агентство.

    Проверка раньше договора намеренно: кабинет уводит сюда, пока анкета
    не пройдена, а отсюда при договоре уводило бы обратно в кабинет —
    договор, заведённый агентством до анкеты, замкнул бы их по кругу.
  */
  if (client && needsBrief(client)) {
    const user = await prisma.user.findFirst({
      where: { id: actor.id },
      select: { fullName: true, email: true, phone: true, phoneVerified: true },
    });

    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Несколько вопросов — и начнём</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            О компании и о том, кого ищете. По одному вопросу, займёт пару минут.
          </p>
        </div>
        <BriefWizard
          userId={actor.id}
          initial={{
            name: user && !isPlaceholderName(user) ? user.fullName : "",
          }}
          // Телефон уже есть у вошедших по номеру (проверен) и у
          // зарегистрированных по почте (назван на первом экране)
          needsPhone={!(user?.phoneVerified ?? user?.phone)}
          needsEmail={!user || !isDeliverableEmail(user.email)}
        />
      </div>
    );
  }

  // Условия уже есть — в онбординге делать нечего
  if (await hasAgreement(actor.clientId)) redirect("/dashboard");

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
