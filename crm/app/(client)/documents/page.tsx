import { FileText } from "lucide-react";

import { InvoiceList } from "@/components/finance/invoice-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format-date";
import type { AgreementStatus } from "@/lib/generated/prisma/enums";
import { describePricing } from "@/lib/pricing";
import { getAgreementFileUrl, toPricingParams } from "@/lib/services/agreements";
import { listInvoices } from "@/lib/services/invoices";

export const metadata = { title: "Документы" };

export default async function DocumentsPage() {
  const actor = await requireClientActor();
  authorize(actor, "invoice.view", { clientId: actor.clientId });

  const [agreements, invoices] = await Promise.all([
    prisma.agreement.findMany({
      where: { clientId: actor.clientId ?? "" },
      orderBy: { createdAt: "desc" },
    }),
    listInvoices(actor),
  ]);

  const active = agreements.find((a) => a.status === "ACTIVE");
  const activeFileUrl = active ? await getAgreementFileUrl(active.id) : null;
  const unpaid = invoices.filter(
    (i) => i.status === "ISSUED" || i.status === "OVERDUE",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Документы</h1>
        <p className="text-sm text-muted-foreground">
          Условия сотрудничества и счета
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Условия сотрудничества</CardTitle>
          {active && (
            <CardDescription>{describePricing(toPricingParams(active))}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!active ? (
            <p className="text-sm text-muted-foreground">
              {describeMissingAgreement(agreements[0]?.status ?? null)}
            </p>
          ) : (
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="Документ">{active.title}</Row>
              <Row label="Действует с">{formatDate(active.startsAt)}</Row>
              <Row label="Гарантия замены">{active.guaranteeDays} дней</Row>
              <Row label="Предоплата">
                {active.prepaymentPercent > 0
                  ? `${active.prepaymentPercent}%`
                  : "Нет"}
              </Row>
              {active.paymentTerms && (
                <Row label="Условия оплаты" wide>
                  {active.paymentTerms}
                </Row>
              )}
            </dl>
          )}
          {activeFileUrl && (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href={activeFileUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="size-4" />
                Скачать скан договора
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Неоплаченные наверх: это то, что требует действия. «Остальные»
          нарочно исключают их же — иначе один и тот же счёт выглядел
          дважды на одном экране, как будто это ошибка */}
      {unpaid.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Ждут оплаты</h2>
          <InvoiceList invoices={unpaid} emptyText="" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">
            {unpaid.length > 0 ? "Остальные счета" : "Все счета"}
          </h2>
          {invoices.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href="/api/reports/invoices">
                <FileText className="size-4" />
                Выгрузить в CSV
              </a>
            </Button>
          )}
        </div>
        <InvoiceList
          invoices={invoices.filter((i) => !unpaid.includes(i))}
          emptyText="Счетов пока не было."
        />
      </div>
    </div>
  );
}

/**
 * «Действующего договора нет» без объяснения выглядело как сбой —
 * непонятно, это временно (ждём агентство) или что-то пошло не так.
 */
function describeMissingAgreement(latestStatus: AgreementStatus | null): string {
  switch (latestStatus) {
    case "PENDING":
      return "Договор ждёт подтверждения агентством. Как только менеджер согласует условия, здесь появятся детали.";
    case "EXPIRED":
      return "Срок последнего договора истёк. Обратитесь к менеджеру, чтобы продлить.";
    case "TERMINATED":
      return "Договор расторгнут. Обратитесь к менеджеру, если нужно оформить новый.";
    default:
      return "Договор ещё не оформлен.";
  }
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
