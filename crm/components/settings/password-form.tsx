"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changePasswordAction, type PasswordState } from "@/app/actions/passwords";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Меняем…" : "Сменить пароль"}
    </Button>
  );
}

/**
 * Смена пароля.
 *
 * Форма одна на оба кабинета: пароль устроен одинаково и у рекрутера,
 * и у заказчика, а две копии разошлись бы при первой же правке.
 *
 * Поля с autoComplete по спецификации: без current-password и
 * new-password менеджеры паролей не понимают, что происходит,
 * и предлагают сохранить не то.
 */
export function PasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Текущий пароль</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPassword">Новый пароль</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
          <p className="text-xs text-muted-foreground">
            Не короче 10 символов. Длинная фраза надёжнее короткого набора
            символов и запоминается легче.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPasswordConfirm">Повторите новый</Label>
          <Input
            id="newPasswordConfirm"
            name="newPasswordConfirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />
    </form>
  );
}
