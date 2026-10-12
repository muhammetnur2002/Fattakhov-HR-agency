"use client";

import { updateProfileAction, type ProfileState } from "@/app/actions/profile";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/hooks/use-form-action";

function Submit({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel="Сохраняем…">
      Сохранить
    </SubmitButtonBase>
  );
}

/**
 * Свои данные — единственное место, где их можно поправить.
 *
 * Имя и должность задаются один раз при принятии приглашения; опечатку
 * или смену должности исправить было негде.
 *
 * Ошибка — у своего поля («Укажите имя и фамилию»), набранное после отказа остаётся.
 */
export function ProfileForm({
  fullName,
  phone,
  position,
}: {
  fullName: string;
  phone: string | null;
  position: string | null;
}) {
  const { state, fields, pending, formProps } = useFormAction<ProfileState>(updateProfileAction, {});

  return (
    <form {...formProps} className="space-y-4">
      <Field label="Имя" error={fields.fullName}>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </Field>
      <Field label="Должность" error={fields.position}>
        <Input
          id="position"
          name="position"
          defaultValue={position ?? ""}
          placeholder="Показывается собеседникам в кабинете"
        />
      </Field>
      <Field label="Телефон" error={fields.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="+7 999 123-45-67"
        />
      </Field>

      <FormMessage error={state.error} ok={state.ok} />

      <Submit loading={pending} />
    </form>
  );
}
