"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Общие куски форм создания и восстановления доступа — используются и
 * командой агентства (components/team/staff-forms.tsx), и пользователями
 * клиента (components/clients/create-user-form.tsx). Пароль в обоих
 * случаях задаёт тот, кто заводит аккаунт, и сообщает его человеку лично.
 */

export type AccountFormState = { error?: string; ok?: string };
export type AccountAction = (
  prev: AccountFormState,
  formData: FormData,
) => Promise<AccountFormState>;

export function SubmitButton({
  label,
  pending: pendingLabel,
}: {
  label: string;
  pending: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function FormMessages({ state }: { state: AccountFormState }) {
  return (
    <>
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
    </>
  );
}

/** Тот, кто завёл аккаунт, перевыдаёт пароль человеку, который его забыл. */
export function ResetPasswordForm({
  userId,
  action,
  hint,
  hiddenFields,
}: {
  userId: string;
  action: AccountAction;
  hint: string;
  /** Например clientId — чей это пользователь, для проверки прав в действии. */
  hiddenFields?: Record<string, string>;
}) {
  const [state, formAction] = useActionState<AccountFormState, FormData>(action, {});
  const prefix = `reset-${userId}`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-password`}>Новый пароль</Label>
          <Input id={`${prefix}-password`} name="password" type="password" required minLength={10} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-passwordConfirm`}>Ещё раз</Label>
          <Input id={`${prefix}-passwordConfirm`} name="passwordConfirm" type="password" required minLength={10} />
        </div>
      </div>
      <SubmitButton label="Задать новый пароль" pending="Сохраняем…" />
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      <FormMessages state={state} />
    </form>
  );
}
