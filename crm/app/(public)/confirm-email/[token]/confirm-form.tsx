"use client";

import Link from "next/link";
import { useActionState } from "react";

import { confirmEmailAction, type ConfirmEmailState } from "./actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";

function Submit() {
  return (
    <SubmitButtonBase className="w-full" pendingLabel="Подтверждаем…">
      Подтвердить почту
    </SubmitButtonBase>
  );
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ConfirmEmailState, FormData>(
    confirmEmailAction,
    {},
  );

  if (state.confirmed) {
    return (
      <div className="space-y-4 text-sm">
        <p>
          Почта подтверждена. Уведомления о кандидатах будут приходить на{" "}
          <span className="font-medium">{state.confirmed}</span>.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">Перейти в кабинет</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <Submit />
    </form>
  );
}
