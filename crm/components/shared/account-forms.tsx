"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/form-state";
import { useFormAction } from "@/lib/hooks/use-form-action";

/**
 * Общие куски форм создания и восстановления доступа — используются и
 * командой агентства (components/team/staff-forms.tsx), и пользователями
 * клиента (components/clients/create-user-form.tsx). Пароль в обоих
 * случаях задаёт тот, кто заводит аккаунт, и сообщает его человеку лично.
 */

export type AccountFormState = FormState;
export type AccountAction = (
  prev: AccountFormState,
  formData: FormData,
) => Promise<AccountFormState>;

export function SubmitButton({
  label,
  pending: pendingLabel,
  loading,
}: {
  label: string;
  pending: string;
  /** Форма уходит через `useFormAction`, а не `action`: `useFormStatus` её не видит. */
  loading?: boolean;
}) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel={pendingLabel}>
      {label}
    </SubmitButtonBase>
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
  // Успех очищает форму: новый пароль не должен висеть в странице, когда дело сделано
  const { state, fields, pending, formProps } = useFormAction(action, {}, { resetOnSuccess: true });
  const prefix = `reset-${userId}`;

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Новый пароль" error={fields.password}>
          <Input id={`${prefix}-password`} name="password" type="password" required minLength={10} />
        </Field>
        <Field label="Ещё раз" error={fields.passwordConfirm}>
          <Input id={`${prefix}-passwordConfirm`} name="passwordConfirm" type="password" required minLength={10} />
        </Field>
      </div>
      <SubmitButton label="Задать новый пароль" pending="Сохраняем…" loading={pending} />
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
