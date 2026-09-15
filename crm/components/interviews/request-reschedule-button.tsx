"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestRescheduleAction,
  type InterviewState,
} from "@/app/actions/interviews";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Отправляем…" : "Запросить перенос"}
    </Button>
  );
}

/** Клиент просит другое время — не назначает его сам (см. app/actions/interviews.ts). */
export function RequestRescheduleButton({ interviewId }: { interviewId: string }) {
  const [state, formAction] = useActionState<InterviewState, FormData>(
    requestRescheduleAction,
    {},
  );

  if (state.ok) {
    return <span className="text-xs text-muted-foreground">{state.ok}</span>;
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="interviewId" value={interviewId} />
      <Submit />
      {state.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}
