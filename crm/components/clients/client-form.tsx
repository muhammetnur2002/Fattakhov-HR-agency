"use client";

import { useState } from "react";

import type { FormState } from "@/app/(agency)/a/clients/actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/lib/hooks/use-form-action";

export type AccountManagerOption = { id: string; fullName: string };

// Как и у фильтров: Radix не даёт пустую строку как значение пункта,
// а «Не назначен» на сервере как раз и должен превратиться в пустую строку.
const NO_MANAGER = "__none__";

export type ClientFormValues = {
  name?: string | null;
  legalName?: string | null;
  inn?: string | null;
  industry?: string | null;
  city?: string | null;
  website?: string | null;
  description?: string | null;
  accountManagerId?: string | null;
};

function SubmitButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel="Сохраняем…">
      {label}
    </SubmitButtonBase>
  );
}

export function ClientForm({
  action,
  clientId,
  employerId,
  values = {},
  managers,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  clientId?: string;
  /** Заявка на привязку к CRM, из которой создаётся этот клиент — см. app/(agency)/a/clients/link-requests. */
  employerId?: string;
  values?: ClientFormValues;
  managers: AccountManagerOption[];
  submitLabel: string;
}) {
  // Набранное остаётся после отказа, ошибки — у своих полей («ИНН — 10 цифр», «Ссылка должна начинаться с https://»)
  const { state, fields, pending, formProps } = useFormAction(action, {});
  const [managerId, setManagerId] = useState(values.accountManagerId ?? NO_MANAGER);

  return (
    <form {...formProps} className="space-y-6">
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      {employerId && <input type="hidden" name="employerId" value={employerId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" required className="sm:col-span-2" error={fields.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name ?? ""}
            required
            autoFocus
          />
        </Field>

        <Field label="Юридическое название" error={fields.legalName}>
          <Input
            id="legalName"
            name="legalName"
            defaultValue={values.legalName ?? ""}
            placeholder="ООО «Пример»"
          />
        </Field>

        <Field label="ИНН" error={fields.inn}>
          <Input
            id="inn"
            name="inn"
            defaultValue={values.inn ?? ""}
            inputMode="numeric"
            placeholder="10 или 12 цифр"
          />
        </Field>

        <Field label="Отрасль" error={fields.industry}>
          <Input
            id="industry"
            name="industry"
            defaultValue={values.industry ?? ""}
            placeholder="Логистика"
          />
        </Field>

        <Field label="Город" error={fields.city}>
          <Input id="city" name="city" defaultValue={values.city ?? ""} />
        </Field>

        <Field label="Сайт" className="sm:col-span-2" error={fields.website}>
          <Input
            id="website"
            name="website"
            type="url"
            defaultValue={values.website ?? ""}
            placeholder="https://example.ru"
          />
        </Field>

        <Field
          label="Ответственный менеджер"
          id="accountManagerId"
          className="sm:col-span-2"
          error={fields.accountManagerId}
        >
          {(control) => (
            <>
              <input
                type="hidden"
                name="accountManagerId"
                value={managerId === NO_MANAGER ? "" : managerId}
              />
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANAGER}>Не назначен</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field
          label="О компании"
          className="sm:col-span-2"
          hint="Чем рекрутер будет продавать вакансию кандидату: продукт, команда, чем интересно"
          error={fields.description}
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={values.description ?? ""}
          />
        </Field>
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      <SubmitButton label={submitLabel} loading={pending} />
    </form>
  );
}
