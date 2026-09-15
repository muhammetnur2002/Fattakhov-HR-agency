import { AppShell } from "@/components/shell/app-shell";
import { requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AGENCY_NAV } from "@/lib/nav";

/** Рабочее место агентства. Всё под /a, чтобы не пересекаться с кабинетом клиента. */
export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      {children}
    </AppShell>
  );
}
