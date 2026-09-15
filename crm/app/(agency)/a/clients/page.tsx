import Link from "next/link";

import { ClientList } from "@/components/clients/client-list";
import { SearchField } from "@/components/shell/search-field";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Клиенты" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "client.view");

  const { q } = await searchParams;
  const clients = await listClients(actor, { query: q });
  const canManage = canDo(actor, "client.manage");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Клиенты</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length === 0
              ? "Пока ни одного клиента"
              : `Всего ${clients.length}`}
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/a/clients/new">Новый клиент</Link>
          </Button>
        )}
      </div>

      <SearchField placeholder="Название, город, отрасль…" />

      <ClientList
        clients={clients}
        emptyText={
          q
            ? "Ничего не нашлось по этому запросу."
            : "Заведите первого клиента, чтобы принимать от него заявки на подбор."
        }
      />
    </div>
  );
}
