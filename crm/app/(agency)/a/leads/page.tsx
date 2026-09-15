import { LeadActions } from "./lead-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { listLeads, type LeadView } from "@/lib/services/leads";

export const metadata = { title: "Заявки с сайта" };

const STATUS_LABELS: Record<LeadView["status"], string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  CONVERTED: "Стал клиентом",
  REJECTED: "Не сложилось",
  SPAM: "Спам",
};

/**
 * Заявки с лендинга.
 *
 * Первое, что видит человек: контакт и число вакансий. Всё остальное
 * подчинено этому, потому что задача здесь одна, позвонить быстрее,
 * чем конкурент.
 */
export default async function LeadsPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "client.manage", { clientId: null });

  const leads = await listLeads();
  const fresh = leads.filter((l) => l.status === "NEW").length;
  /*
    Взятая в работу заявка ещё не разобрана: у неё те же кнопки
    следующего шага («Стал клиентом» / «Не сложилось»), что и у новой.
    Раньше в счёт шли только новые, и страница писала «все разобраны»
    прямо над заявкой, которая ждала решения.
  */
  const inProgress = leads.filter((l) => l.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Заявки с сайта</h1>
        <p className="text-sm text-muted-foreground">
          {leads.length === 0
            ? "Заявок пока нет"
            : fresh > 0
              ? `${fresh} ${fresh === 1 ? "новая" : "новых"} из ${leads.length}`
              : inProgress > 0
                ? `${inProgress} в работе из ${leads.length}`
                : `Всего ${leads.length}, все разобраны`}
        </p>
      </div>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Заявки с главной страницы сайта появляются здесь сразу после
            отправки, вместе с уведомлением.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {leads.map((lead) => (
            <Card key={lead.id} className={lead.status === "NEW" ? "border-primary/40" : undefined}>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{lead.name}</span>
                    {lead.company && (
                      <span className="text-sm text-muted-foreground">
                        {lead.company}
                      </span>
                    )}
                    <Badge variant={lead.status === "NEW" ? "default" : "secondary"}>
                      {STATUS_LABELS[lead.status]}
                    </Badge>
                  </div>

                  <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Связь</dt>
                      <dd className="font-medium">{lead.contact}</dd>
                    </div>
                    {lead.vacancies && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Вакансий</dt>
                        <dd>{lead.vacancies}</dd>
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Сайт</dt>
                        <dd className="truncate">{lead.website}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Пришла</dt>
                      <dd>{formatWhen(lead.createdAt)}</dd>
                    </div>
                  </dl>

                  {lead.note && (
                    <p className="rounded-md bg-muted/60 p-3 text-sm leading-relaxed">
                      {lead.note}
                    </p>
                  )}
                </div>

                <div className="lg:text-right">
                  <LeadActions leadId={lead.id} status={lead.status} />
                </div>
              </CardContent>
            </Card>
          ))}
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
