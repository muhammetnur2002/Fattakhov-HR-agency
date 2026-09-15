import Link from "next/link";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/a/clients">← Клиенты</Link>
        </Button>
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
        <CardHeader>
          <CardTitle>Новый клиент</CardTitle>
        </CardHeader>
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
