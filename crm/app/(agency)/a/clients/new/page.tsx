import { createClientAction } from "../actions";
import { ClientForm } from "@/components/clients/client-form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { getLead } from "@/lib/services/leads";
import { listAccountManagers } from "@/lib/services/clients";
import { Card, CardContent } from "@/components/ui/card";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Новый клиент" };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "client.manage");

  const { leadId } = await searchParams;
  const [managers, lead] = await Promise.all([
    listAccountManagers(actor),
    leadId ? getLead(leadId) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex">
          <BackLink href="/a/clients" className="mb-0">
            Клиенты
          </BackLink>
        </div>
        <PageTitle>Новый клиент</PageTitle>
      </div>

      {/*
        Компания и сайт переносятся прямо в поля формы — их дальше
        менять незачем. А вот имя того, кто оставил заявку, и его
        контакт в карточку клиента не превращаются: это не поле формы,
        а будущий приглашённый пользователь, и его e-mail заявка может
        не сообщать вовсе (человек мог оставить телефон или Telegram).
        Оставляем эти данные здесь же — не потерять, но не тащить
        мимо формы, для которой они не значение поля.
      */}
      {lead && (
        <Alert>
          <AlertTitle>Из заявки «{lead.name}»</AlertTitle>
          <AlertDescription>
            <div>Контакт: {lead.contact}</div>
            {lead.vacancies && <div>Вакансий планирует: {lead.vacancies}</div>}
            {lead.note && <div>Комментарий: {lead.note}</div>}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <ClientForm
            action={createClientAction}
            managers={managers}
            submitLabel="Создать клиента"
            values={
              lead
                ? { name: lead.company || lead.name, website: lead.website }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
