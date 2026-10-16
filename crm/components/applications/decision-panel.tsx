"use client";

import { CalendarPlus, PauseCircle, ThumbsDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { decideAction, type DecisionState } from "@/app/actions/decisions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { SubmitButton } from "@/components/ui/submit-button";
import { panelClass } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REJECTION_REASON_LABELS,
  REJECTION_REASONS_BY_SIDE,
} from "@/lib/labels";
import type {
  ClientDecision,
  RejectionReason,
} from "@/lib/generated/prisma/enums";
import { useFormAction } from "@/lib/hooks/use-form-action";

function DecisionButton({
  label,
  icon,
  variant = "outline",
  loading,
}: {
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "outline";
  /** Форма причины отказа уходит через useFormAction, `useFormStatus` её не видит. */
  loading?: boolean;
}) {
  return (
    // Пока идёт отправка — индикатор вместо значка, подпись прежняя
    <SubmitButton variant={variant} className="gap-2" loading={loading} pendingLabel={label}>
      {icon}
      {label}
    </SubmitButton>
  );
}

/**
 * Панель решения по кандидату (BR-12).
 *
 * Три кнопки вместо переписки: клиент, которому надо написать письмо,
 * чтобы отреагировать, не реагирует неделю. Отказ требует причину —
 * из неё потом собирается отчёт, по которому калибруется поиск (BR-11).
 *
 * `onBehalf` включается, когда панель открыл сотрудник агентства:
 * решение будет записано как внесённое со слов клиента (BR-14).
 *
 * `onDecided` — опциональный колбэк для мест, где карточка кандидата
 * живёт вне этой страницы (сравнение кандидатов на доске): сама панель
 * не знает о такой карточке и не может её обновить, а револидация пути
 * этой страницы её не тронет.
 */
export function DecisionPanel({
  applicationId,
  onBehalf,
  currentDecision,
  onDecided,
}: {
  applicationId: string;
  onBehalf: boolean;
  currentDecision: string | null;
  onDecided?: (decision: ClientDecision, rejectionReason?: RejectionReason) => void;
}) {
  // Кнопки «интервью» и «пауза» — формы из одних скрытых полей (action, терять нечего); форма причины
  // отказа идёт через onSubmit: комментарий не должен пропадать, если сервер отказал
  const { state, fields, pending, formAction, formProps, messageRef } = useFormAction<DecisionState>(decideAction, {});
  const [rejecting, setRejecting] = useState(false);
  // «Отказать» заменяет кнопки формой причины: фокус — на первое поле, после «Отмены» — на «Отказать» (ConfirmBlock)
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const lastDecision = useRef<ClientDecision | null>(null);

  useEffect(() => {
    if (state.ok && lastDecision.current && onDecided) {
      onDecided(
        lastDecision.current,
        lastDecision.current === "REJECT"
          ? (reason as RejectionReason)
          : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-3">
      {onBehalf && (
        <p className="text-xs text-muted-foreground">
          Вы вносите решение со слов клиента. В его кабинете появится
          пометка, что решение внесли вы.
        </p>
      )}

      {!rejecting && (
        <div className="flex flex-wrap gap-2">
          <form
            action={formAction}
            onSubmit={() => (lastDecision.current = "INTERVIEW")}
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="decision" value="INTERVIEW" />
            <DecisionButton
              label="Пригласить на интервью"
              icon={<CalendarPlus className="size-4" />}
              variant="default"
            />
          </form>

          <form
            action={formAction}
            onSubmit={() => (lastDecision.current = "HOLD")}
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="decision" value="HOLD" />
            <DecisionButton
              label="Взять паузу"
              icon={<PauseCircle className="size-4" />}
            />
          </form>

          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setRejecting(true)}
          >
            <ThumbsDown className="size-4" />
            Отказать
          </Button>
        </div>
      )}

      {/* Вопроса на экране нет — форма сама просит причину; для читалки она названа, чтобы фокус в поле не был «ниоткуда» */}
      <ConfirmBlock
        open={rejecting}
        onOpenChange={setRejecting}
        triggerRef={triggerRef}
        formProps={{
          ...formProps,
          onSubmit: (event) => {
            lastDecision.current = "REJECT";
            formProps.onSubmit(event);
          },
        }}
        className={panelClass("plain", "space-y-4")}
        questionHidden
        question="Отказ кандидату: укажите причину"
        confirmLabel={
          <>
            <ThumbsDown className="size-4" />
            Отказать
          </>
        }
        pendingLabel="Отказать"
        confirmVariant="outline"
        confirmClassName="gap-2"
        size="default"
        pending={pending}
      >
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="decision" value="REJECT" />
        <input type="hidden" name="rejectedBy" value="CLIENT" />

        <Field
          label="Почему не подходит"
          id="rejectionReason"
          error={fields.rejectionReason}
          hint="Причина нужна не для отчётности: по ней рекрутер поймёт, кого искать дальше."
        >
          {(control) => (
            <Select name="rejectionReason" value={reason} onValueChange={setReason}>
              <SelectTrigger {...control} className="w-full">
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS_BY_SIDE.CLIENT.map((code) => (
                  <SelectItem key={code} value={code}>
                    {REJECTION_REASON_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          label={`Комментарий${reason === "OTHER" ? "" : " (необязательно)"}`}
          error={fields.rejectionComment}
        >
          <Textarea
            id="rejectionComment"
            name="rejectionComment"
            rows={2}
            required={reason === "OTHER"}
          />
        </Field>
      </ConfirmBlock>

      {currentDecision && !state.ok && (
        <p className="text-xs text-muted-foreground">
          Решение можно изменить — например, вернуть кандидата из паузы.
        </p>
      )}

      {/* Плашка стоит после формы, не в ней: ссылка нужна, чтобы фокус после отказа дошёл до неё */}
      <FormMessage ref={messageRef} error={state.error} ok={state.ok} />
    </div>
  );
}
