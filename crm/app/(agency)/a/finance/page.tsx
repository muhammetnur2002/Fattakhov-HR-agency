import {
  BillableHireRow,
  InvoiceActions,
} from "@/components/finance/invoice-actions";
import { InvoiceList } from "@/components/finance/invoice-list";
import { StatCard } from "@/components/shell/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { formatMoney } from "@/lib/pricing";
import {
  listBillableHires,
  listInvoices,
  receivables,
} from "@/lib/services/invoices";

export const metadata = { title: "Финансы" };

export default async function FinancePage() {
  const actor = await requireAgencyActor();
  authorize(actor, "invoice.view");

  const [hires, invoices, money] = await Promise.all([
    listBillableHires(actor),
    listInvoices(actor),
    receivables(actor),
  ]);

  const canManage = canDo(actor, "invoice.manage");
  const pending = hires.filter((h) => !h.invoiced);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Финансы</h1>
        <p className="text-sm text-muted-foreground">
          Закрытые позиции, счета и дебиторка
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Готовы к выставлению"
          value={pending.length}
          hint="закрытых позиций без счёта"
          accent
        />
        <StatCard
          label="Дебиторка"
          value={formatMoney(money.total)}
          hint={`${money.count} ${pluralIssued(money.count)} ${pluralInvoices(money.count)}`}
        />
        <StatCard
          label="Просрочено"
          value={formatMoney(money.overdue)}
          hint={`${money.overdueCount} ${pluralInvoices(money.overdueCount)}`}
          accent
        />
      </div>

      {/*
        Раньше этот блок был под правом выставлять счета, а плитка
        «Готовы к выставлению» — нет. Руководитель подбора видел число
        закрытых позиций и не мог посмотреть, что за ним стоит: цифра
        без состава и без действия. Список показываем всем, кто видит
        счета, а кнопку выставления оставляем тем, кто её нажимает.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Закрытые позиции</CardTitle>
          <CardDescription>
            Сумма посчитана по действующему договору от фактического
            оффера кандидата, а не от вилки в брифе.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Все закрытые позиции выставлены.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((hire) => (
                <BillableHireRow
                  key={hire.applicationId}
                  hire={hire}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Счета</h2>
        <InvoiceList
          invoices={invoices}
          showClient
          emptyText="Счетов пока нет."
          renderActions={
            canManage
              ? (invoice) => (
                  <InvoiceActions
                    invoiceId={invoice.id}
                    status={invoice.status}
                    invoiceFileUrl={invoice.invoiceFileUrl}
                    actFileUrl={invoice.actFileUrl}
                  />
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}

function pluralInvoices(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "счёт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "счёта";
  return "счетов";
}

function pluralIssued(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? "выставленный" : "выставленных";
}
