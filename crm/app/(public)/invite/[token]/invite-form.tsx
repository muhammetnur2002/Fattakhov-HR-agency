"use client";

import { acceptInvite, type AcceptState } from "./actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/hooks/use-form-action";

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase className="w-full" loading={loading} pendingLabel="Создаём доступ…">
      Принять приглашение
    </SubmitButtonBase>
  );
}

export function InviteForm({ token }: { token: string }) {
  // Имя остаётся после отказа («пароли не совпадают»), ошибка стоит у своего поля
  const { state, fields, pending, formProps } = useFormAction<AcceptState>(acceptInvite, {});

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <Field label="Имя и фамилия" error={fields.fullName}>
        <Input id="fullName" name="fullName" required autoFocus />
      </Field>

      <Field
        label="Пароль"
        error={fields.password}
        hint="Не короче 10 символов. Длинная фраза надёжнее короткого набора символов и запоминается легче."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Field label="Повторите пароль" error={fields.passwordConfirm}>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <FormMessage error={state.error} />

      <SubmitButton loading={pending} />
    </form>
  );
}
