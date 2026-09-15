import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import type { ClientStatus } from "@/lib/generated/prisma/enums";

export type ClientListItem = {
  id: string;
  name: string;
  city: string | null;
  industry: string | null;
  status: ClientStatus;
  agreementStatus: string | null;
  _count: { vacancies: number; users: number };
};

export function ClientList({
  clients,
  emptyText,
}: {
  clients: ClientListItem[];
  emptyText: string;
}) {
  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {clients.map((client) => (
        <Link key={client.id} href={`/a/clients/${client.id}`}>
          <Card className="transition-colors hover:border-primary/40">
            {/* Сетка на широком экране — см. VacancyList */}
            <CardContent
              className="
                flex flex-wrap items-center gap-x-6 gap-y-2 p-4
                xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]
              "
            >
              <div className="min-w-48 flex-1 xl:min-w-0">
                <div className="font-medium">{client.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[client.city, client.industry].filter(Boolean).join(" · ") ||
                    "Реквизиты не заполнены"}
                </div>
              </div>

              <div className="text-sm text-muted-foreground xl:text-right">
                {client._count.vacancies} {pluralVacancies(client._count.vacancies)} ·{" "}
                {client._count.users} польз.
              </div>

              {/* Бейджи в своих ячейках: прямыми детьми сетки они
                  растянулись бы на всю её ширину */}
              <div className="xl:text-right">
                <AgreementBadge status={client.agreementStatus} />
              </div>

              <div className="xl:text-right">
                <Badge variant={client.status === "ACTIVE" ? "default" : "secondary"}>
                  {CLIENT_STATUS_LABELS[client.status]}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function pluralVacancies(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "вакансия";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "вакансии";
  return "вакансий";
}

/** Отдельный бейдж под договор: «ждёт подтверждения» — это задача аккаунту, её видно сразу. */
function AgreementBadge({ status }: { status: string | null }) {
  if (status === "ACTIVE") {
    return <Badge variant="outline">Договор действует</Badge>;
  }
  if (status === "PENDING") {
    return <Badge variant="destructive">Ждёт подтверждения</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Без договора
    </Badge>
  );
}
