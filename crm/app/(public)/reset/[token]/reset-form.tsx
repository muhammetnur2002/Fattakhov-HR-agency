"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPasswordAction, type PasswordState } from "@/app/actions/passwords";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить пароль"}
    </Button>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<PasswordState, FormData>(
    resetPasswordAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h2 className="font-medium">Пароль изменён</h2>
        {/* Автоматически внутрь не пускаем: вход с новым паролем это
            подтверждение, что человек его запомнил, а не только вставил */}
        <Button asChild className="w-full">
          <Link href="/login">Войти с новым паролем</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Не короче 10 символов. Длинная фраза надёжнее короткого набора
          символов и запоминается легче.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPasswordConfirm">Повторите пароль</Label>
        <Input
          id="newPasswordConfirm"
          name="newPasswordConfirm"
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
