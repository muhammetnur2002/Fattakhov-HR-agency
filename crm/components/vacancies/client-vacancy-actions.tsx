"use client";

import { useRef, useState } from "react";

import {
  clientTransitionAction,
  type VacancyActionState,
} from "@/app/actions/vacancies";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { panelClass } from "@/components/ui/panel";
import { useFormAction } from "@/lib/hooks/use-form-action";

function Submit({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <SubmitButtonBase size="sm" variant="outline" loading={loading}>
      {label}
    </SubmitButtonBase>
  );
}

export function ClientVacancyActions({
  vacancyId,
  status,
  canHold,
  canClose,
}: {
  vacancyId: string;
  status: VacancyStatus;
  canHold: boolean;
  canClose: boolean;
}) {
  // Причина отмены набирается текстом и остаётся после отказа; кнопки «приостановить» и «возобновить» —
  // формы без полей (action)
  const { state, pending, formAction, formProps, messageRef } = useFormAction<VacancyActionState>(
    clientTransitionAction,
    {},
  );
  const [cancelling, setCancelling] = useState(false);
  // «Отменить заявку» заменяется формой причины: фокус — в поле, а после «Не отменять» — обратно на кнопку (ConfirmBlock)
  const triggerRef = useRef<HTMLButtonElement>(null);

  const showHold = canHold && status === "ACTIVE";
  const showResume = canHold && status === "ON_HOLD";
  const showCancel =
    canClose && ["SUBMITTED", "CLARIFYING", "ESTIMATED", "ACTIVE", "ON_HOLD"].includes(status);

  if (!showHold && !showResume && !showCancel) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {showHold && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ON_HOLD" />
            <Submit label="Приостановить" />
          </form>
        )}

        {showResume && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ACTIVE" />
            <Submit label="Возобновить" />
          </form>
        )}

        {showCancel && !cancelling && (
          <Button
            ref={triggerRef}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCancelling(true)}
          >
            Отменить заявку
          </Button>
        )}
      </div>

      {/* Причина обязательна: без неё в аналитике останется дыра,
          а рекрутер не поймёт, что пошло не так */}
      <ConfirmBlock
        open={cancelling}
        onOpenChange={setCancelling}
        triggerRef={triggerRef}
        formProps={formProps}
        className={panelClass("plain", "space-y-2")}
        question="Почему отменяете?"
        questionFor="closeReason"
        confirmLabel="Отменить заявку"
        confirmVariant="outline"
        cancelLabel="Не отменять"
        pending={pending}
      >
        <input type="hidden" name="vacancyId" value={vacancyId} />
        <input type="hidden" name="to" value="CLOSED_CANCELLED" />
        <Input
          id="closeReason"
          name="closeReason"
          required
          placeholder="Закрыли внутренним переводом"
        />
      </ConfirmBlock>

      <FormMessage ref={messageRef} error={state.error} />
    </div>
  );
}
