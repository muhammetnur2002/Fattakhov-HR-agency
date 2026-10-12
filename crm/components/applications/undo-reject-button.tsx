"use client";

import { useActionState, useEffect, useRef } from "react";

import { undoRejectAction, type DecisionState } from "@/app/actions/decisions";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";

function Submit() {
  return (
    <SubmitButtonBase size="sm" variant="outline" pendingLabel="Отменяем…">
      Отменить отказ
    </SubmitButtonBase>
  );
}

/**
 * Кнопка отмены — только для решения, принятого через DecisionPanel
 * (clientDecision === "REJECT"). Отказ, который занёс кандидат сам
 * (WITHDRAWN через отдельную форму агентства), сюда не попадает —
 * отменить чужой уход с рынка нельзя, это не ошибка клика.
 *
 * `onUndone` — как у DecisionPanel: для мест вроде экрана сравнения,
 * где карточка живёт в локальном стейте доски и revalidatePath этой
 * страницы её не тронет.
 */
export function UndoRejectButton({
  applicationId,
  onUndone,
}: {
  applicationId: string;
  onUndone?: () => void;
}) {
  const [state, formAction] = useActionState<DecisionState, FormData>(
    undoRejectAction,
    {},
  );
  const notified = useRef(false);

  useEffect(() => {
    if (state.ok && onUndone && !notified.current) {
      notified.current = true;
      onUndone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <Submit />
      <FormMessage error={state.error} />
    </form>
  );
}
