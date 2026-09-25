import Link from "next/link";

import { LinkRequestActions } from "./link-request-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { listAccountManagers, listClients } from "@/lib/services/clients";
import { fetchCrmLinkRequests } from "@/lib/students-service";

export const metadata = { title: "Заявки на привязку к CRM" };

const MODERATION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  APPROVED: { label: "Профиль одобрен на платформе", variant: "default" },
  PENDING: { label: "Профиль ещё на проверке", variant: "secondary" },
  REJECTED: { label: "Профиль отклонён на платформе", variant: "destructive" },
};

/**
 * Заявки «объедините с профилем в CRM» — от компаний, зарегистрированных
 * самостоятельно на студенческой платформе. Данные читаются с той
 * платформы напрямую (см. lib/students-service.ts), решение возвращается
 * туда же: компания получает crmClientId и дальше входит в CRM своим
 * паролем со студенческой платформы, без повторной регистрации.
 */
export default async function LinkRequestsPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "client.manage");

  const [requests, managers, clients] = await Promise.all([
    fetchCrmLinkRequests(),
    listAccountManagers(actor),
    listClients(actor),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/clients">← Клиенты</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Заявки на привязку к CRM</h1>
        <p className="text-sm text-muted-foreground">
          {requests.length === 0
            ? "Заявок пока нет"
            : `${requests.length} ${requests.length === 1 ? "заявка ждёт" : "заявок ждут"} решения`}
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Сюда попадают компании, которые зарегистрировались сами на
            студенческой платформе и оставили заявку «у нас уже есть
            профиль в CRM».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {requests.map((r) => {
            const moderation = MODERATION_LABELS[r.moderationStatus] ?? MODERATION_LABELS.PENDING;
            return (
              <Card key={r.employerId}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.companyName}</span>
                    <Badge variant={moderation.variant}>{moderation.label}</Badge>
                  </div>

                  <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Контакт</dt>
                      <dd className="font-medium">{r.contactName}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Почта</dt>
                      <dd>{r.email}</dd>
                    </div>
                    {r.phone && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Телефон</dt>
                        <dd>{r.phone}</dd>
                      </div>
                    )}
                    {r.inn && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">ИНН</dt>
                        <dd>{r.inn}</dd>
                      </div>
                    )}
                    {r.city && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Город</dt>
                        <dd>{r.city}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Заявка</dt>
                      <dd>{formatWhen(new Date(r.requestedAt))}</dd>
                    </div>
                  </dl>

                  {r.note && (
                    <p className="rounded-md bg-muted/60 p-3 text-sm leading-relaxed">
                      {r.note}
                    </p>
                  )}

                  <LinkRequestActions
                    employerId={r.employerId}
                    existingClients={clients.map((c) => ({ id: c.id, name: c.name }))}
                    managers={managers}
                    prefill={{ name: r.companyName, inn: r.inn, city: r.city }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
