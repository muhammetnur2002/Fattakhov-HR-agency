"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { undoRejectAction, type DecisionState } from "@/app/actions/decisions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Отменяем…" : "Отменить отказ"}
    </Button>
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
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
