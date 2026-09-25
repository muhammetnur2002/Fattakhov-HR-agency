import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CLIENT_NAV } from "@/lib/nav";
import { hasAgreement } from "@/lib/services/agreements";

/**
 * Кабинет клиента. Живёт в корне (ТЗ 15): для заказчика платформа —
 * основной адрес, а не подраздел агентского инструмента.
 *
 * Условия сотрудничества здесь не отбирают вход: BR-1 блокирует только
 * запуск вакансии в работу (см. transitionVacancy), а до этого клиент
 * может смотреть кабинет, заводить черновик и отправлять заявку без
 * выбранного тарифа. Раньше первым экраном после входа была страница
 * тарифов — человек, ничего ещё не увидевший в продукте, сразу упирался
 * в решение о деньгах. Теперь тариф предлагает ненавязчивая плашка
 * здесь же, а не стена перед кабинетом.
 */
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireClientActor();

  const [client, agreementChosen] = await Promise.all([
    actor.clientId
      ? prisma.client.findFirst({
          where: { id: actor.clientId },
          select: { name: true },
        })
      : null,
    actor.clientId ? hasAgreement(actor.clientId) : true,
  ]);

  return (
    <AppShell
      actor={actor}
      nav={CLIENT_NAV}
      title={client?.name ?? "Кабинет"}
      notificationsHref="/notifications"
      searchHrefBase=""
    >
      {!agreementChosen && (
        <Alert className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <AlertTitle>Условия сотрудничества ещё не выбраны</AlertTitle>
            <AlertDescription>
              Посмотрите кабинет и попробуйте завести вакансию — тариф
              понадобится, только когда решите отправить её в работу.
            </AlertDescription>
          </div>
          <Button asChild size="sm">
            <Link href="/onboarding">Выбрать условия</Link>
          </Button>
        </Alert>
      )}
      {children}
    </AppShell>
  );
}
