import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createClientUserAction,
  resetClientUserPasswordAction,
  updateClientAction,
} from "../actions";
import {
  AgreementFileUpload,
  ConfirmAgreementButton,
  TerminateAgreementButton,
} from "@/components/clients/agreement-actions";
import { ClientForm } from "@/components/clients/client-form";
import { CreateClientUserForm } from "@/components/clients/create-user-form";
import { ResetPasswordForm } from "@/components/shared/account-forms";
import { withEmailOff } from "@/components/shared/email-off";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { CLIENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/labels";
import { describePricing } from "@/lib/pricing";
import { getAgreementFileUrl, toPricingParams } from "@/lib/services/agreements";
import { getClient, listAccountManagers } from "@/lib/services/clients";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  const client = await getClient(actor, id);
  return { title: client?.name ?? "Клиент" };
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  authorize(actor, "client.view", { clientId: id });

  const client = await getClient(actor, id);
  if (!client) notFound();

  const canManage = canDo(actor, "client.manage", { clientId: id });
  const canManageAgreement = canDo(actor, "agreement.manage", { clientId: id });
  const canViewUsers = canDo(actor, "client.viewUsers", { clientId: id });
  const canViewAgreements = canDo(actor, "agreement.view", { clientId: id });
  const managers = await listAccountManagers(actor);

  const pendingAgreement = client.agreements.find((a) => a.status === "PENDING");

  // Ссылка на скан у каждого договора — отдельными запросами: их обычно
  // один-два на клиента, вложенный select здесь того не стоит.
  // Тому, кто вкладку с договорами не увидит, эти запросы не делаем вовсе.
  const agreementFileUrls = canViewAgreements
    ? Object.fromEntries(
        await Promise.all(
          client.agreements.map(
            async (a) => [a.id, await getAgreementFileUrl(a.id)] as const,
          ),
        ),
      )
    : {};

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/clients">← Клиенты</Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <Badge variant={client.status === "ACTIVE" ? "default" : "secondary"}>
            {CLIENT_STATUS_LABELS[client.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[client.city, client.industry].filter(Boolean).join(" · ") ||
            "Реквизиты не заполнены"}
          {" · "}
          {client.vacancyCount} {pluralVacancies(client.vacancyCount)}
        </p>
      </div>

      {/* Договор, ждущий подтверждения — задача аккаунт-менеджера прямо сейчас,
          поэтому вынесен наверх, а не спрятан во вкладку */}
      {pendingAgreement && canManageAgreement && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">
              Клиент выбрал условия — подтвердите
            </CardTitle>
            <CardDescription>
              {describePricing(toPricingParams(pendingAgreement))}. Гарантия{" "}
              {pendingAgreement.guaranteeDays} дней.{" "}
              {pendingAgreement.paymentTerms}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmAgreementButton
              agreementId={pendingAgreement.id}
              clientId={client.id}
            />
          </CardContent>
        </Card>
      )}

      {/*
        Рекрутёру карточка клиента нужна как справка «что это за компания»,
        а не как досье: условия договора и учётные записи заказчика к его
        работе с воронкой отношения не имеют. Вкладки скрыты по правам,
        а не по роли — см. lib/access.
      */}
      <Tabs defaultValue={canViewUsers ? "people" : "details"}>
        <TabsList>
          {canViewUsers && <TabsTrigger value="people">Пользователи</TabsTrigger>}
          {canViewAgreements && (
            <TabsTrigger value="agreements">Договоры</TabsTrigger>
          )}
          <TabsTrigger value="details">Реквизиты</TabsTrigger>
        </TabsList>

        {/* --- Пользователи и приглашения --- */}
        {canViewUsers && (
        <TabsContent value="people" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Пользователи клиента</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Пока ни одного аккаунта не создано.
                </p>
              ) : (
                client.users.map((u) => (
                  <div
                    key={u.id}
                    className="space-y-2.5 border-b pb-5 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="min-w-48 flex-1">
                        <div className="text-sm font-medium">{u.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {withEmailOff(u.email, u.email)}
                          {u.position ? ` · ${u.position}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline">{ROLE_LABELS[u.role]}</Badge>
                      <div className="text-xs text-muted-foreground">
                        {u.lastLoginAt
                          ? `Заходил ${formatDate(u.lastLoginAt)}`
                          : "Ни разу не заходил"}
                      </div>
                    </div>

                    {canManage && (
                      <details className="rounded-lg border px-3 py-2">
                        <summary className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">
                          Задать новый пароль
                        </summary>
                        <div className="mt-4">
                          <ResetPasswordForm
                            userId={u.id}
                            action={resetClientUserPasswordAction}
                            hint="Прежний пароль перестанет работать сразу — сообщите новый клиенту лично."
                            hiddenFields={{ clientId: client.id }}
                          />
                        </div>
                      </details>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Создать аккаунт</CardTitle>
                <CardDescription>
                  Задайте пароль и сообщите его клиенту лично — почта и пароль
                  работают сразу, ссылка-приглашение не нужна.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CreateClientUserForm
                  clientId={client.id}
                  action={createClientUserAction}
                  noUsersYet={client.users.length === 0}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        {/* --- Договоры --- */}
        {canViewAgreements && (
        <TabsContent value="agreements" className="space-y-4 pt-4">
          {client.agreements.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Условия сотрудничества клиент выбирает сам при первом входе
                в кабинет. Пригласите администратора, чтобы это стало возможно.
              </CardContent>
            </Card>
          ) : (
            client.agreements.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <AgreementStatusBadge status={a.status} />
                  </div>
                  <CardDescription>
                    {describePricing(toPricingParams(a))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Row label="Гарантия замены">{a.guaranteeDays} дней</Row>
                    <Row label="Предоплата">
                      {a.prepaymentPercent > 0
                        ? `${a.prepaymentPercent}%`
                        : "Нет"}
                    </Row>
                    <Row label="Начало">{formatDate(a.startsAt)}</Row>
                    <Row label="Подтверждён клиентом">
                      {a.acceptedAt ? formatDate(a.acceptedAt) : "—"}
                    </Row>
                    {a.paymentTerms && (
                      <Row label="Условия оплаты" wide>
                        {a.paymentTerms}
                      </Row>
                    )}
                  </dl>

                  {canManageAgreement && a.status === "PENDING" && (
                    <ConfirmAgreementButton
                      agreementId={a.id}
                      clientId={client.id}
                    />
                  )}
                  {canManageAgreement && a.status === "ACTIVE" && (
                    <TerminateAgreementButton
                      agreementId={a.id}
                      clientId={client.id}
                    />
                  )}

                  {canManageAgreement ? (
                    <AgreementFileUpload
                      agreementId={a.id}
                      clientId={client.id}
                      fileUrl={agreementFileUrls[a.id]}
                    />
                  ) : (
                    agreementFileUrls[a.id] && (
                      <Button asChild variant="outline" size="sm">
                        <a href={agreementFileUrls[a.id]!} target="_blank" rel="noopener noreferrer">
                          <FileText className="size-4" />
                          Скачать скан
                        </a>
                      </Button>
                    )
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        )}

        {/* --- Реквизиты --- */}
        <TabsContent value="details" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              {canManage ? (
                <ClientForm
                  action={updateClientAction}
                  clientId={client.id}
                  values={client}
                  managers={managers}
                  submitLabel="Сохранить"
                />
              ) : (
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Row label="Юридическое название">
                    {client.legalName ?? "—"}
                  </Row>
                  <Row label="ИНН">{client.inn ?? "—"}</Row>
                  <Row label="Отрасль">{client.industry ?? "—"}</Row>
                  <Row label="Город">{client.city ?? "—"}</Row>
                  <Row label="Сайт" wide>
                    {client.website ?? "—"}
                  </Row>
                  <Row label="О компании" wide>
                    {client.description ?? "—"}
                  </Row>
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function AgreementStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    PENDING: { label: "Ждёт подтверждения", variant: "destructive" },
    ACTIVE: { label: "Действует", variant: "default" },
    EXPIRED: { label: "Истёк", variant: "secondary" },
    TERMINATED: { label: "Расторгнут", variant: "secondary" },
  };
  const s = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function pluralVacancies(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "вакансия";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "вакансии";
  return "вакансий";
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
