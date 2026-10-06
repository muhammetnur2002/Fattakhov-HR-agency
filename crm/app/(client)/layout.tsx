import type { Viewport } from "next";
import { redirect } from "next/navigation";

import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { AppShell } from "@/components/shell/app-shell";
import { ContractGate } from "@/components/client/contract-gate";
import { CooperationBanner } from "@/components/client/cooperation-banner";
import { PushPromptGate } from "@/components/shell/push-prompt-gate";
import { PushServiceWorker } from "@/components/shell/push-service-worker";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { CABINET_METADATA } from "@/lib/cabinet-metadata";
import { TELEGRAM_HREF } from "@/lib/contacts";
import { prisma } from "@/lib/db/prisma";
import { CLIENT_NAV } from "@/lib/nav";
import { pushConfigured } from "@/lib/notifications/push-config";
import type { ContractGateAccess, ContractState } from "@/lib/contract-gate";
import { getActiveAgreement, hasAgreement } from "@/lib/services/agreements";
import { needsBrief } from "@/lib/services/registration";

// Установка на экран «Домой» и цифры без автоссылок — см. lib/cabinet-metadata.ts
export const metadata = CABINET_METADATA;

/*
  Во весь экран, с отступами безопасной зоны вручную (AppShell,
  BottomTabs): иначе нижняя панель разделов на iPhone без кнопки
  «Домой» уходила бы под полосу жеста. Только кабинеты — у сайта
  свои правила, и его вёрстка на вырез не рассчитана. Остальные поля
  viewport (ширина, цвет полосы) приходят из app/layout.tsx.
*/
export const viewport: Viewport = {
  viewportFit: "cover",
};

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
          select: {
            name: true,
            status: true,
            selfRegisteredAt: true,
            briefCompletedAt: true,
          },
        })
      : null,
    actor.clientId ? hasAgreement(actor.clientId) : true,
    actor.clientId ? getActiveAgreement(actor.clientId) : null,
  ]);

  // Зарегистрировались сами, а анкету ещё не прошли: при регистрации
  // спрашивался только способ входа, и ни компании, ни контакта, ни того,
  // кого ищут, у агентства нет. Кабинет без этого пуст — ведём на анкету.
  // Только до анкеты: условия сотрудничества не требуются, без договора
  // кабинет открыт, как и был. Онбординг вне этой группы маршрутов —
  // зацикливания нет
  if (client && needsBrief(client)) redirect("/onboarding");

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

  // Путь к договору — у администратора компании: остальным замок и плашка
  // не показывают «Документы» (там им 404) и выбор условий
  const contractAccess: ContractGateAccess = {
    chooseTerms: canDo(actor, "agreement.accept", { clientId: actor.clientId }),
    documents: canDo(actor, "invoice.view", { clientId: actor.clientId }),
    students: canDo(actor, "students.enterAsClient"),
  };

  return (
    <AppShell
      actor={actor}
      nav={CLIENT_NAV}
      title={client?.name ?? "Кабинет"}
      notificationsHref="/notifications"
      searchHrefBase=""
      contractLocked={contractState !== "active"}
    >
      {/* Пульс «в сети»: раз в минуту, пока вкладка на виду (/api/presence) */}
      <PresenceHeartbeat />
      {/* Воркер пушей — только в кабинетах и только при настроенном канале */}
      {pushConfigured() && <PushServiceWorker />}
      {pushConfigured() && <PushPromptGate userId={actor.id} />}
      {contractState !== "active" && (
        <CooperationBanner
          state={contractState}
          access={contractAccess}
          telegramHref={TELEGRAM_HREF}
        />
      )}
      <ContractGate
        state={contractState}
        access={contractAccess}
        telegramHref={TELEGRAM_HREF}
      >
        {children}
      </ContractGate>
    </AppShell>
  );
}
