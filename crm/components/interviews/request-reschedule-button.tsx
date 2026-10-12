"use client";

import { useActionState } from "react";

import {
  requestRescheduleAction,
  type InterviewState,
} from "@/app/actions/interviews";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

function Submit() {
  return (
    <SubmitButtonBase size="sm" variant="outline" pendingLabel="Отправляем…">
      Запросить перенос
    </SubmitButtonBase>
  );
}

/** Клиент просит другое время — не назначает его сам (см. app/actions/interviews.ts). */
export function RequestRescheduleButton({ interviewId }: { interviewId: string }) {
  const [state, formAction] = useActionState<InterviewState, FormData>(
    requestRescheduleAction,
    {},
  );

  if (state.ok) {
    return <FormMessage compact ok={state.ok} />;
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="interviewId" value={interviewId} />
      <Submit />
      <FormMessage compact error={state.error} />
    </form>
  );
}
