"use client";

import { useActionState } from "react";

import {
  FormMessages,
  SubmitButton,
  type AccountAction,
  type AccountFormState,
} from "@/components/shared/account-forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/labels";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"] as const;

/**
 * Аккаунт пользователя клиента, который заводит аккаунт-менеджер. Пароль
 * задаёт он сам и сообщает клиенту лично — ссылка-приглашение здесь не
 * нужна (в отличие от app/(client)/settings, где клиент зовёт коллегу
 * сам и передать пароль лично некому).
 */
export function CreateClientUserForm({
  clientId,
  action,
  noUsersYet = false,
}: {
  clientId: string;
  action: AccountAction;
  /** Первому пользователю — роль администратора по умолчанию: он выбирает тариф на онбординге. */
  noUsersYet?: boolean;
}) {
  const [state, formAction] = useActionState<AccountFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientId" value={clientId} />

      {noUsersYet && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Тариф на онбординге выбирает только «Администратор» — назначьте эту
          роль первому пользователю, остальным — уже по ролям.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client-create-email">Почта</Label>
          <Input id="client-create-email" name="email" type="email" required placeholder="name@company.ru" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-create-fullName">Имя и фамилия</Label>
          <Input id="client-create-fullName" name="fullName" required maxLength={120} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client-create-password">Пароль</Label>
          <Input id="client-create-password" name="password" type="password" required minLength={10} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-create-passwordConfirm">Пароль ещё раз</Label>
          <Input id="client-create-passwordConfirm" name="passwordConfirm" type="password" required minLength={10} />
        </div>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Пароль сообщите клиенту лично — письма платформа не отправляет.
      </p>

      <div className="space-y-2">
        <Label htmlFor="client-create-role">Роль</Label>
        <Select name="role" defaultValue={noUsersYet ? "CLIENT_ADMIN" : "CLIENT_HIRING"}>
          <SelectTrigger id="client-create-role" className="w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SubmitButton label="Создать аккаунт" pending="Создаём…" />
      <FormMessages state={state} />
    </form>
  );
}
