import { AppShell } from "@/components/shell/app-shell";
import { ContractGate } from "@/components/client/contract-gate";
import { CooperationBanner } from "@/components/client/cooperation-banner";
import { requireClientActor } from "@/lib/auth/session";
import { TELEGRAM_HREF } from "@/lib/contacts";
import { prisma } from "@/lib/db/prisma";
import { CLIENT_NAV } from "@/lib/nav";
import type { ContractState } from "@/lib/contract-gate";
import { getActiveAgreement, hasAgreement } from "@/lib/services/agreements";

/**
 * Кабинет клиента. Живёт в корне (ТЗ 15): для заказчика платформа —
 * основной адрес, а не подраздел агентского инструмента.
 *
 * Вход в кабинет условия не отбирают: без договора клиент видит кабинет,
 * пользуется студенческой платформой и сообщениями. Разделы работы агентства
 * (заявки на подбор, кандидаты, календарь, аналитика, документы) до договора
 * показаны размытыми с замком и причиной — см. ContractGate. Плашку про условия
 * можно закрыть, но на закрытых разделах она стоит всегда.
 */
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireClientActor();

  const [client, agreementChosen, activeAgreement] = await Promise.all([
    actor.clientId
      ? prisma.client.findFirst({
          where: { id: actor.clientId },
          select: { name: true, status: true },
        })
      : null,
    actor.clientId ? hasAgreement(actor.clientId) : true,
    actor.clientId ? getActiveAgreement(actor.clientId) : null,
  ]);

  // Договор действует — всё открыто. Условия выбраны, но агентство ещё не
  // подтвердило — ждём. Ничего не выбрано — предлагаем тариф. Закрыты только
  // разделы работы агентства (см. lib/contract-gate.ts): студенческая
  // платформа, сообщения и дашборд доступны всегда
  const contractState: ContractState =
    !actor.clientId || activeAgreement || client?.status === "ACTIVE"
      ? "active"
      : agreementChosen
        ? "pending"
        : "none";

  return (
    <AppShell
      actor={actor}
      nav={CLIENT_NAV}
      title={client?.name ?? "Кабинет"}
      notificationsHref="/notifications"
      searchHrefBase=""
      contractLocked={contractState !== "active"}
    >
      {contractState !== "active" && (
        <CooperationBanner state={contractState} telegramHref={TELEGRAM_HREF} />
      )}
      <ContractGate state={contractState} telegramHref={TELEGRAM_HREF}>
        {children}
      </ContractGate>
    </AppShell>
  );
}
