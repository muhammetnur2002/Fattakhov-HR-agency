import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CLIENT_NAV } from "@/lib/nav";
import { hasAgreement } from "@/lib/services/agreements";

/**
 * Кабинет клиента. Живёт в корне (ТЗ 15): для заказчика платформа —
 * основной адрес, а не подраздел агентского инструмента.
 */
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireClientActor();

  // Пока условия сотрудничества не выбраны, кабинет показывать нечем:
  // без договора нельзя запустить ни одну вакансию (BR-1). Уводим
  // в онбординг — он лежит вне этой группы маршрутов, зацикливания нет.
  if (actor.clientId && !(await hasAgreement(actor.clientId))) {
    redirect("/onboarding");
  }

  const client = actor.clientId
    ? await prisma.client.findFirst({
        where: { id: actor.clientId },
        select: { name: true },
      })
    : null;

  return (
    <AppShell
      actor={actor}
      nav={CLIENT_NAV}
      title={client?.name ?? "Кабинет"}
      notificationsHref="/notifications"
      searchHrefBase=""
    >
      {children}
    </AppShell>
  );
}
