"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/app/(agency)/a/clients/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : label}
    </Button>
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
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [managerId, setManagerId] = useState(values.accountManagerId ?? NO_MANAGER);

  return (
    <form action={formAction} className="space-y-6">
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      {employerId && <input type="hidden" name="employerId" value={employerId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" htmlFor="name" required className="sm:col-span-2">
          <Input
            id="name"
            name="name"
            defaultValue={values.name ?? ""}
            required
            autoFocus
          />
        </Field>

        <Field label="Юридическое название" htmlFor="legalName">
          <Input
            id="legalName"
            name="legalName"
            defaultValue={values.legalName ?? ""}
            placeholder="ООО «Пример»"
          />
        </Field>

        <Field label="ИНН" htmlFor="inn">
          <Input
            id="inn"
            name="inn"
            defaultValue={values.inn ?? ""}
            inputMode="numeric"
            placeholder="10 или 12 цифр"
          />
        </Field>

        <Field label="Отрасль" htmlFor="industry">
          <Input
            id="industry"
            name="industry"
            defaultValue={values.industry ?? ""}
            placeholder="Логистика"
          />
        </Field>

        <Field label="Город" htmlFor="city">
          <Input id="city" name="city" defaultValue={values.city ?? ""} />
        </Field>

        <Field label="Сайт" htmlFor="website" className="sm:col-span-2">
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
          htmlFor="accountManagerId"
          className="sm:col-span-2"
        >
          <input
            type="hidden"
            name="accountManagerId"
            value={managerId === NO_MANAGER ? "" : managerId}
          />
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectTrigger id="accountManagerId" className="w-full">
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
        </Field>

        <Field
          label="О компании"
          htmlFor="description"
          className="sm:col-span-2"
          hint="Чем рекрутер будет продавать вакансию кандидату: продукт, команда, чем интересно"
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={values.description ?? ""}
          />
        </Field>
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

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
  required,
  hint,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
