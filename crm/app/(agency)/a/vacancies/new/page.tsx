import Link from "next/link";

import { VacancyWizard } from "@/components/vacancies/vacancy-wizard";
import { Button } from "@/components/ui/button";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Новая заявка" };

/**
 * Заявка на подбор, заведённая агентством.
 *
 * Нужна потому, что половина заявок приходит голосом: клиент позвонил
 * и продиктовал вакансию. Заставлять его после этого идти в кабинет
 * и заполнять форму значит не получить заявку вовсе.
 *
 * Мастер тот же, что у клиента: разъехавшиеся копии брифа разошлись бы
 * по полям в первый же месяц. Отличий два - выбор компании и адрес,
 * куда уводит после отправки.
 *
 * Дальше заявка идёт обычным путём: попадает в «Требуют реакции»
 * и принимается так же, как присланная клиентом. Отдельной ветки
 * состояний для «своих» заявок нет и не должно быть.
 */
export default async function AgencyNewVacancyPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "vacancy.create", { clientId: null });

  const { clientId } = await searchParams;

  // Только те, с кем есть действующий договор: без него вакансию всё
  // равно нельзя будет запустить (BR-1), и выбор такого клиента здесь
  // означал бы тупик через два экрана
  const clients = await prisma.client.findMany({
    where: {
      organizationId: actor.organizationId,
      agreements: { some: { status: "ACTIVE" } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Заказчиком может быть любой пользователь выбранной компании.
  // Если клиент пришёл из карточки, сразу подтягиваем его людей
  const hiringManagers = clientId
    ? await prisma.user.findMany({
        where: {
          clientId,
          role: { in: ["CLIENT_HIRING", "CLIENT_ADMIN"] },
          isActive: true,
        },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      })
    : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/vacancies">← Вакансии</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Заявка на подбор</h1>
        <p className="text-sm text-muted-foreground">
          Заводится за клиента: пригодится, когда вакансию продиктовали
          голосом. Клиент увидит её в своём кабинете и сможет дополнить.
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Нет ни одного клиента с действующим договором. Заявку не на кого
          завести: сначала подтвердите условия сотрудничества в карточке
          клиента.
        </div>
      ) : (
        <VacancyWizard
          clients={clients}
          hiringManagers={hiringManagers}
          hrefBase="/a/vacancies"
          initialClientId={clientId}
        />
      )}
    </div>
  );
}
