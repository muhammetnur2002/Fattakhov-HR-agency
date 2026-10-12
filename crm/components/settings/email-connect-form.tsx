"use client";

import { requestEmailAction, type FormState } from "@/app/(client)/settings/actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/hooks/use-form-action";

function Submit({ again, loading }: { again: boolean; loading: boolean }) {
  return (
    <SubmitButtonBase variant="outline" loading={loading} pendingLabel="Отправляем…">
      {again ? "Отправить ссылку ещё раз" : "Отправить ссылку"}
    </SubmitButtonBase>
  );
}

/**
 * Рабочая почта для вошедших по телефону.
 * Адрес подключается после перехода по ссылке из письма.
 */
export function EmailConnectForm({ pendingEmail }: { pendingEmail: string | null }) {
  const { state, fields, pending, formProps } = useFormAction<FormState>(requestEmailAction, {});

  return (
    <form {...formProps} className="space-y-4">
      <Field label="Рабочая почта" error={fields.email}>
        <Input
          id="work-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={pendingEmail ?? ""}
          required
        />
      </Field>
      <FormMessage error={state.error} ok={state.ok} />
      <Submit again={pendingEmail !== null} loading={pending} />
    </form>
  );
}
