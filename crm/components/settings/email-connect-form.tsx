"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestEmailAction, type FormState } from "@/app/(client)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit({ again }: { again: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Отправляем…" : again ? "Отправить ссылку ещё раз" : "Отправить ссылку"}
    </Button>
  );
}

/**
 * Рабочая почта для вошедших по телефону.
 * Адрес подключается после перехода по ссылке из письма.
 */
export function EmailConnectForm({ pendingEmail }: { pendingEmail: string | null }) {
  const [state, formAction] = useActionState<FormState, FormData>(requestEmailAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="work-email">Рабочая почта</Label>
        <Input
          id="work-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={pendingEmail ?? ""}
          required
        />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && <p className="text-sm text-muted-foreground">{state.ok}</p>}
      <Submit again={pendingEmail !== null} />
    </form>
  );
}
