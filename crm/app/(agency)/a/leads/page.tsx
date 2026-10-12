import type { ReactNode } from "react";

import { LeadActions } from "./lead-actions";
import { LeadStatusFilter } from "@/components/leads/lead-status-filter";
import { ListRegion } from "@/components/shell/list-pending";
import { ListToolbar } from "@/components/shell/list-toolbar";
import { SearchField } from "@/components/shell/search-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { LEAD_STATUS_LABELS as STATUS_LABELS } from "@/lib/labels";
import { listLeads } from "@/lib/services/leads";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { cn } from "@/lib/utils";

export const metadata = { title: "Заявки с сайта" };

/**
 * Заявки с лендинга.
 *
 * Первое, что видит человек: контакт и число вакансий. Всё остальное
 * подчинено этому, потому что задача здесь одна, позвонить быстрее,
 * чем конкурент.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: LeadStatus }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "client.manage", { clientId: null });

  const { q, status } = await searchParams;
  const leads = await listLeads({ query: q, status });
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
        <PageTitle>Заявки с сайта</PageTitle>
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

      <ListToolbar
        search={<SearchField placeholder="Имя, компания, контакт…" />}
        filters={<LeadStatusFilter />}
      />

      <ListRegion>
        {leads.length === 0 ? (
          <EmptyState>
            {q || status
              ? "Ничего не нашлось по этому запросу."
              : "Заявки с главной страницы сайта появляются здесь сразу после отправки, вместе с уведомлением."}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {leads.map((lead) => (
              <Card key={lead.id} className={lead.status === "NEW" ? "border-primary/40" : undefined}>
                {/*
                  Карточка — фиксированная сетка, одинаковая у всех заявок:
                  имя, четыре поля, заметка, кнопки. Раньше «Вакансий» и «Сайт»
                  выводились только когда заполнены, заметка тоже, а кнопки
                  стояли в колонке справа, ширина которой менялась от статуса
                  («Стал клиентом» шире, чем «Спам»), — и вторая колонка полей
                  съезжала от карточки к карточке, высота гуляла, а кнопки
                  «прыгали». Теперь пустое поле — прочерк, заметка — всегда
                  на месте, кнопки отдельной строкой внизу.
                */}
                <CardContent className="grid gap-4">
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
                    <LeadField label="Контакт" strong>
                      {lead.contact}
                    </LeadField>
                    <LeadField label="Вакансий">{lead.vacancies}</LeadField>
                    <LeadField label="Сайт" truncate>
                      {lead.website}
                    </LeadField>
                    <LeadField label="Пришла">{formatWhen(lead.createdAt)}</LeadField>
                  </dl>

                  <Panel tone="muted" className="text-sm leading-relaxed">
                    <dl>
                      <LeadField label="Заметка">{lead.note}</LeadField>
                    </dl>
                  </Panel>

                  <LeadActions leadId={lead.id} status={lead.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ListRegion>
    </div>
  );
}

/**
 * Поле заявки: подпись и значение. Колонка подписи одной ширины у всех полей,
 * поэтому значения встают на одну вертикаль. Пустое — прочерк, а не пропуск:
 * от этого у всех карточек один набор строк.
 */
function LeadField({
  label,
  children,
  strong = false,
  truncate = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
  truncate?: boolean;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          strong && !empty && "font-medium",
          truncate && "truncate",
          empty && "text-muted-foreground",
          !truncate && "break-words",
        )}
      >
        {empty ? "—" : children}
      </dd>
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
