import type { Viewport } from "next";

import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { AppShell } from "@/components/shell/app-shell";
import { PushPromptGate } from "@/components/shell/push-prompt-gate";
import { PushServiceWorker } from "@/components/shell/push-service-worker";
import { requireAgencyActor } from "@/lib/auth/session";
import { CABINET_METADATA } from "@/lib/cabinet-metadata";
import { prisma } from "@/lib/db/prisma";
import { AGENCY_NAV } from "@/lib/nav";
import { pushConfigured } from "@/lib/notifications/push-config";

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

/** Рабочее место агентства. Всё под /a, чтобы не пересекаться с кабинетом клиента. */
export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Сотрудника без включённой 2FA requireAgencyActor отправляет на экран
  // принудительной настройки (/security/two-factor): остальной кабинет
  // до этого закрыт. Выход и статика — вне макета, их это не касается
  const actor = await requireAgencyActor();

  const organization = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { name: true },
  });

  return (
    <AppShell
      actor={actor}
      nav={AGENCY_NAV}
      title={organization?.name ?? "Агентство"}
      notificationsHref="/a/notifications"
      searchHrefBase="/a"
    >
      {/* Пульс «в сети»: раз в минуту, пока вкладка на виду (/api/presence) */}
      <PresenceHeartbeat />
      {/* Воркер пушей — только в кабинетах и только при настроенном канале */}
      {pushConfigured() && <PushServiceWorker />}
      {pushConfigured() && <PushPromptGate userId={actor.id} />}
      {children}
    </AppShell>
  );
}
