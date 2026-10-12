"use client";

import { changePasswordAction, type PasswordState } from "@/app/actions/passwords";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/hooks/use-form-action";

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel="Меняем…">
      Сменить пароль
    </SubmitButtonBase>
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
 *
 * Пароли не уходят из формы никуда, кроме запроса: после успеха поля очищаются, после отказа
 * стирается только текущий пароль (неверный его всё равно набирать заново), новый остаётся.
 */
export function PasswordForm() {
  const { state, fields, pending, formProps } = useFormAction<PasswordState>(
    changePasswordAction,
    {},
    { resetOnSuccess: true, clearOnError: ["currentPassword"] },
  );

  return (
    <form {...formProps} className="space-y-4">
      <Field label="Текущий пароль" error={fields.currentPassword}>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
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
          />
        </Field>

        <Field label="Повторите новый" error={fields.newPasswordConfirm}>
          <Input
            id="newPasswordConfirm"
            name="newPasswordConfirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      <SubmitButton loading={pending} />
    </form>
  );
}
