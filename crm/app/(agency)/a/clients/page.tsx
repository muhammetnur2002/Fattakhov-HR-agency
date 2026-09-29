import Link from "next/link";

import { CompanyActions } from "./company-actions";
import { ClientList } from "@/components/clients/client-list";
import { SearchField } from "@/components/shell/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { listAccountManagers, listClients } from "@/lib/services/clients";
import { fetchApprovedCompanies, fetchCrmLinkRequests } from "@/lib/students-service";

export const metadata = { title: "Клиенты" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "client.view");

  const { q } = await searchParams;
  const canManage = canDo(actor, "client.manage");
  const [clients, linkRequests, approvedCompanies, managers] = await Promise.all([
    listClients(actor, { query: q }),
    // Заявки и одобренные компании читаются, только если раздел вообще
    // доступен: без прав на управление клиентами решать их всё равно нельзя
    canManage ? fetchCrmLinkRequests().catch(() => []) : Promise.resolve([]),
    canManage ? fetchApprovedCompanies().catch(() => []) : Promise.resolve([]),
    canManage ? listAccountManagers(actor) : Promise.resolve([]),
  ]);

  // Служебный вызов не умеет фильтровать по имени — компаний тут обычно
  // немного, поэтому фильтруем здесь же, тем же запросом q, что и клиентов
  const query = q?.trim().toLowerCase();
  const filteredCompanies = query
    ? approvedCompanies.filter(
        (c) =>
          c.companyName.toLowerCase().includes(query) ||
          (c.city ?? "").toLowerCase().includes(query),
      )
    : approvedCompanies;

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
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/a/clients/funnel">Воронка студплатформы</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/a/clients/link-requests" className="flex items-center gap-2">
                Заявки на привязку
                {linkRequests.length > 0 && <Badge>{linkRequests.length}</Badge>}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/a/clients/new">Новый клиент</Link>
            </Button>
          </div>
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

      {canManage && filteredCompanies.length > 0 && (
        <div className="space-y-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold">Со студенческой платформы</h2>
            <p className="text-sm text-muted-foreground">
              Одобрены как компании на студенческой платформе, но ещё не клиенты
              CRM — заявку на привязку не оставляли. Добавьте как клиента, если
              работаете с ними и по обычному подбору.
            </p>
          </div>
          <div className="grid gap-3">
            {filteredCompanies.map((c) => (
              <Card key={c.employerId}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.companyName}</span>
                    <Badge variant="secondary">Студенческая платформа</Badge>
                  </div>

                  <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Контакт</dt>
                      <dd className="font-medium">{c.contactName}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Почта</dt>
                      <dd>{c.email}</dd>
                    </div>
                    {c.phone && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Телефон</dt>
                        <dd>{c.phone}</dd>
                      </div>
                    )}
                    {c.inn && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">ИНН</dt>
                        <dd>{c.inn}</dd>
                      </div>
                    )}
                    {c.city && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Город</dt>
                        <dd>{c.city}</dd>
                      </div>
                    )}
                    {c.pendingVacancies > 0 && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">На проверке</dt>
                        <dd>{c.pendingVacancies} вакансий</dd>
                      </div>
                    )}
                  </dl>

                  <CompanyActions
                    employerId={c.employerId}
                    existingClients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                    managers={managers}
                    prefill={{ name: c.companyName, inn: c.inn, city: c.city }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
