"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { acceptInvite, type AcceptState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Создаём доступ…" : "Принять приглашение"}
    </Button>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AcceptState, FormData>(
    acceptInvite,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Имя и фамилия</Label>
        <Input id="fullName" name="fullName" required autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="text-xs text-muted-foreground">
          Не короче 10 символов. Длинная фраза надёжнее короткого набора
          символов и запоминается легче.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">Повторите пароль</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />
    </form>
  );
}
