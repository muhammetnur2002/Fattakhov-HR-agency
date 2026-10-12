"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { resetPasswordAction, type PasswordState } from "@/app/actions/passwords";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/hooks/use-form-action";

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase className="w-full" loading={loading} pendingLabel="Сохраняем…">
      Сохранить пароль
    </SubmitButtonBase>
  );
}

export function ResetForm({ token }: { token: string }) {
  // Пароль остаётся в странице после отказа («пароли не совпадают») — стирать оба поля незачем;
  // наружу он не уходит никуда, кроме запроса
  const { state, fields, pending, formProps } = useFormAction<PasswordState>(resetPasswordAction, {});

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
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <Field
        label="Новый пароль"
        error={fields.newPassword}
        hint="Не короче 10 символов. Длинная фраза надёжнее короткого набора символов и запоминается легче."
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field label="Повторите пароль" error={fields.newPasswordConfirm}>
        <Input
          id="newPasswordConfirm"
          name="newPasswordConfirm"
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
