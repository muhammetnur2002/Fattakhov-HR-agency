import { LinkRequestActions } from "./link-request-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, getUserTimeZone, requireAgencyActor } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format-date";
import { listAccountManagers, listClients } from "@/lib/services/clients";
import { PROFILE_MODERATION_TONE, type ProfileModerationStatus } from "@/lib/status-tones";
import { fetchCrmLinkRequests } from "@/lib/students-service";
import { EmptyState } from "@/components/ui/empty-state";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Заявки на привязку к CRM" };

const MODERATION_LABELS: Record<ProfileModerationStatus, string> = {
  APPROVED: "Профиль одобрен на платформе",
  PENDING: "Профиль ещё на проверке",
  REJECTED: "Профиль отклонён на платформе",
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
  const timeZone = await getUserTimeZone();
  authorize(actor, "client.manage");

  const [requests, managers, clients] = await Promise.all([
    fetchCrmLinkRequests(),
    listAccountManagers(actor),
    listClients(actor),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex">
        <BackLink href="/a/clients" className="mb-0">
          Клиенты
        </BackLink>
      </div>

      <div>
        <PageTitle>Заявки на привязку к CRM</PageTitle>
        <p className="text-sm text-muted-foreground">
          {requests.length === 0
            ? "Заявок пока нет"
            : `${requests.length} ${requests.length === 1 ? "заявка ждёт" : "заявок ждут"} решения`}
        </p>
      </div>

      {requests.length === 0 ? (
        <EmptyState>
          Сюда попадают компании, которые зарегистрировались сами на
          студенческой платформе и оставили заявку «у нас уже есть профиль в
          CRM».
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {requests.map((r) => {
            const moderation: ProfileModerationStatus = r.moderationStatus in MODERATION_LABELS ? r.moderationStatus : "PENDING";
            return (
              <Card key={r.employerId}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.companyName}</span>
                    <StatusBadge tone={PROFILE_MODERATION_TONE[moderation]}>{MODERATION_LABELS[moderation]}</StatusBadge>
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
                      <dd>{formatDateTime(r.requestedAt, timeZone)}</dd>
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
