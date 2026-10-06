"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { confirmEmailAction, type ConfirmEmailState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Подтверждаем…" : "Подтвердить почту"}
    </Button>
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
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Submit />
    </form>
  );
}
