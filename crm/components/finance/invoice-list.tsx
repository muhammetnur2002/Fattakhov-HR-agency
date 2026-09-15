import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
import type { InvoiceStatus } from "@/lib/generated/prisma/enums";
import { formatMoney } from "@/lib/pricing";
import type { InvoiceView } from "@/lib/services/invoices";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Черновик",
  ISSUED: "Выставлен",
  PAID: "Оплачен",
  OVERDUE: "Просрочен",
  CANCELLED: "Аннулирован",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const variant =
    status === "PAID"
      ? "default"
      : status === "OVERDUE"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}

/**
 * Список счетов.
 *
 * `showClient` разделяет кабинеты: агентству нужно видеть, чей счёт,
 * клиенту — нет, у него все свои.
 */
export function InvoiceList({
  invoices,
  showClient = false,
  emptyText,
  renderActions,
}: {
  invoices: InvoiceView[];
  showClient?: boolean;
  emptyText: string;
  renderActions?: (invoice: InvoiceView) => React.ReactNode;
}) {
  if (invoices.length === 0) {
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
      {invoices.map((invoice) => (
        <Card
          key={invoice.id}
          className={cn(invoice.status === "OVERDUE" && "border-destructive/50")}
        >
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  Счёт №{invoice.number}
                  {showClient ? ` · ${invoice.clientName}` : ""}
                </div>
                {invoice.description && (
                  <div className="text-xs text-muted-foreground">
                    {invoice.description}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {invoice.issuedAt
                    ? `Выставлен ${formatDate(invoice.issuedAt)}`
                    : "Не выставлен"}
                  {invoice.dueAt && invoice.status !== "PAID"
                    ? ` · оплатить до ${formatDate(invoice.dueAt)}`
                    : ""}
                  {invoice.paidAt ? ` · оплачен ${formatDate(invoice.paidAt)}` : ""}
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">
                  {formatMoney(invoice.amount)}
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
            </div>

            {/* Просрочка показывается числом дней: «просрочен» без срока
                не создаёт ощущения, что пора звонить */}
            {invoice.status === "OVERDUE" && invoice.daysOverdue !== null && (
              <p className="text-sm text-destructive">
                Просрочен на {invoice.daysOverdue}{" "}
                {pluralDays(invoice.daysOverdue)}
              </p>
            )}

            {(invoice.invoiceFileUrl || invoice.actFileUrl) && (
              <div className="flex flex-wrap gap-2">
                {invoice.invoiceFileUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="size-4" />
                      Скачать счёт
                    </a>
                  </Button>
                )}
                {invoice.actFileUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={invoice.actFileUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="size-4" />
                      Скачать акт
                    </a>
                  </Button>
                )}
              </div>
            )}

            {renderActions?.(invoice)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}
