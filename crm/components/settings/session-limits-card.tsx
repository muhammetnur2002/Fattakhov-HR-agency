"use client";

import { useActionState } from "react";

import {
  saveSessionLimitsAction,
  type SessionSettingsState,
} from "@/app/(agency)/a/settings/session-actions";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { SESSION_CHOICES, type SessionLimits } from "@/lib/auth/session-policy";

function Select({ name, label, value }: { name: string; label: string; value: number | null }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value === null ? "" : String(value)}
        className="h-10 w-full rounded-md border border-field bg-background px-3 text-sm"
      >
        <option value="">По умолчанию</option>
        {SESSION_CHOICES.map((choice) => (
          <option key={choice.minutes} value={choice.minutes}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Предел сессии — только владельцу. Украденная cookie даёт вход без пароля и
 * 2FA; чем короче предел, тем меньше окно, но тем чаще входить заново
 * (у сотрудников агентства — вместе с кодом 2FA). Предел считается от входа,
 * а не от последнего действия, и действует сразу на все сессии.
 */
export function SessionLimitsCard({ limits }: { limits: SessionLimits }) {
  const [state, action] = useActionState<SessionSettingsState, FormData>(saveSessionLimitsAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="agency" label="Сотрудники агентства" value={limits.agency} />
        <Select name="client" label="Клиенты" value={limits.client} />
      </div>
      <p className="text-xs text-muted-foreground">
        По умолчанию: сотрудники агентства 3 суток, клиенты 14 суток. Минимум 20 минут: после этого срока
        нужно входить заново, даже если вы всё время работали.
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pendingLabel="Сохраняем…">Сохранить</SubmitButton>
    </form>
  );
}
