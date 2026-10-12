"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  attachInvoiceFileAction,
  createInvoiceAction,
  transitionInvoiceAction,
  type FinanceState,
} from "@/app/(agency)/a/finance/actions";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { BillableHire } from "@/lib/services/invoices";
import { Panel } from "@/components/ui/panel";
import { useFormAction } from "@/lib/hooks/use-form-action";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";
import { oversizeMessage } from "@/lib/upload-limits";
import { FormMessage } from "@/components/ui/form-message";
import { useTimeZone } from "@/components/shell/time-zone-provider";

function Submit({
  label,
  variant = "default",
  loading,
}: {
  label: string;
  variant?: "default" | "outline";
  /** Форма уходит через useFormAction: useFormStatus её не видит. */
  loading?: boolean;
}) {
  return (
    <SubmitButtonBase size="sm" variant={variant} loading={loading}>
      {label}
    </SubmitButtonBase>
  );
}

function Feedback({ state }: { state: FinanceState }) {
  return <FormMessage error={state.error} ok={state.ok} />;
}

/**
 * Выставление счёта за закрытую позицию.
 *
 * Сумма подставлена по договору от фактического оффера (BR-31), но
 * остаётся редактируемой: скидки, доплаты и частичные оплаты бывают,
 * и заставлять считать их в уме — плохая идея.
 */
export function BillableHireRow({
  hire,
  canManage = true,
}: {
  hire: BillableHire;
  /** Без права выставлять счёт строка остаётся справкой: кто закрыт и на сколько. */
  canManage?: boolean;
}) {
  const timeZone = useTimeZone();
  // Сумма и назначение подставлены заранее и правятся: после отказа сервера React 19 вернул бы
  // подставленное и стёр правку, useFormAction её оставляет
  const { state, pending, formProps } = useFormAction<FinanceState>(createInvoiceAction, {});
  const [open, setOpen] = useState(false);
  // «Выставить счёт» заменяется формой: фокус — в поле суммы, после «Отмены» — обратно на кнопку
  const { triggerRef, focusRef, questionId } = useConfirmFocus<HTMLButtonElement, HTMLInputElement>(open);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{hire.candidateName}</div>
          <div className="text-xs text-muted-foreground">
            №{hire.vacancyNumber} {hire.vacancyTitle} · {hire.clientName}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Вышел {formatDate(hire.hiredAt, timeZone)} ·{" "}
            {hire.offerSalary !== null
              ? `оффер ${formatMoney(hire.offerSalary)}`
              : "оффер не зафиксирован"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {hire.fee !== null ? formatMoney(hire.fee) : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {hire.pricingDescription}
          </div>
        </div>
      </div>

      {hire.invoiced ? (
        <p className="text-xs text-muted-foreground">
          Счёт по этой вакансии уже выставлен.
        </p>
      ) : !canManage ? (
        <p className="text-xs text-muted-foreground">
          Счёт ещё не выставлен — это делает аккаунт-менеджер.
        </p>
      ) : !open ? (
        <Button
          ref={triggerRef}
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={hire.fee === null}
        >
          {hire.fee === null ? "Нет договора или оффера" : "Выставить счёт"}
        </Button>
      ) : (
        <form {...formProps} aria-labelledby={questionId} className="space-y-4 border-t pt-3">
          <span id={questionId} className="sr-only">
            Счёт за {hire.candidateName}, вакансия №{hire.vacancyNumber}
          </span>
          <input type="hidden" name="clientId" value={hire.clientId} />
          <input type="hidden" name="vacancyIds" value={hire.vacancyId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`amount-${hire.applicationId}`}>Сумма, ₽</Label>
              <Input
                ref={focusRef}
                id={`amount-${hire.applicationId}`}
                name="amount"
                type="number"
                defaultValue={hire.fee ?? 0}
                required
              />
              <p className="text-xs text-muted-foreground">
                Посчитано от фактического оффера, не от вилки в брифе.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`description-${hire.applicationId}`}>
                Назначение
              </Label>
              <Input
                id={`description-${hire.applicationId}`}
                name="description"
                defaultValue={`Подбор: ${hire.vacancyTitle} (${hire.candidateName})`}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Submit label="Создать счёт" loading={pending} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
          </div>

          <Feedback state={state} />
        </form>
      )}
    </Panel>
  );
}

/**
 * Прикрепление файла счёта или акта.
 *
 * Отправляется сразу при выборе файла — отдельная кнопка «Загрузить»
 * здесь только лишний клик, реакция и так видна по подписи над полем.
 */
/** Сам input: useFormStatus видит статус только формы-родителя, поэтому он в дочернем компоненте, а не в FileUploadField. */
function AutoUploadInput({
  formRef,
  label,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <FileInput
      size="sm"
      name="file"
      aria-label={label}
      accept=".pdf,.doc,.docx,.rtf,.odt"
      disabled={pending}
      onChange={(event) => {
        // Больше предела запрос не дойдёт до сервера — говорим сразу, а не страницей с ошибкой
        const message = oversizeMessage(event.target.files?.[0]);
        event.target.setCustomValidity(message);
        event.target.ariaInvalid = message ? "true" : null;
        if (message) event.target.reportValidity();
        else formRef.current?.requestSubmit();
      }}
    />
  );
}

function FileUploadField({
  invoiceId,
  kind,
  label,
  attached,
}: {
  invoiceId: string;
  kind: "INVOICE" | "ACT";
  label: string;
  attached: boolean;
}) {
  const [state, formAction] = useActionState<FinanceState, FormData>(
    attachInvoiceFileAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {label}
          {attached && !state.ok && (
            <span className="ml-1.5 text-foreground">· прикреплён</span>
          )}
        </span>
      </label>
      <AutoUploadInput formRef={formRef} label={label} />
      <FormMessage compact error={state.error} ok={state.ok} />
    </form>
  );
}

/** Кнопки смены статуса счёта и загрузка файлов. */
export function InvoiceActions({
  invoiceId,
  status,
  invoiceFileUrl,
  actFileUrl,
}: {
  invoiceId: string;
  status: string;
  invoiceFileUrl: string | null;
  actFileUrl: string | null;
}) {
  const [state, formAction] = useActionState<FinanceState, FormData>(
    transitionInvoiceAction,
    {},
  );

  const actions: { to: string; label: string; variant?: "outline" }[] = [];

  if (status === "DRAFT") {
    actions.push({ to: "ISSUED", label: "Выставить" });
    actions.push({ to: "CANCELLED", label: "Аннулировать", variant: "outline" });
  }
  if (status === "ISSUED" || status === "OVERDUE") {
    actions.push({ to: "PAID", label: "Отметить оплату" });
  }

  return (
    <div className="space-y-3">
      {actions.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <form key={action.to} action={formAction}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="to" value={action.to} />
                <Submit label={action.label} variant={action.variant} />
              </form>
            ))}
          </div>
          <Feedback state={state} />
        </div>
      )}

      {status !== "CANCELLED" && (
        <div className="grid gap-4 border-t pt-3 sm:grid-cols-2">
          <FileUploadField
            invoiceId={invoiceId}
            kind="INVOICE"
            label="Файл счёта"
            attached={Boolean(invoiceFileUrl)}
          />
          <FileUploadField
            invoiceId={invoiceId}
            kind="ACT"
            label="Закрывающий акт"
            attached={Boolean(actFileUrl)}
          />
        </div>
      )}
    </div>
  );
}
