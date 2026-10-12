"use client";

import {
  SubmitButton,
  type AccountAction,
} from "@/components/shared/account-forms";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormAction } from "@/lib/hooks/use-form-action";
import { ROLE_LABELS } from "@/lib/labels";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"] as const;

/**
 * Аккаунт пользователя клиента, который заводит аккаунт-менеджер. Пароль
 * задаёт он сам и сообщает клиенту лично — ссылка-приглашение здесь не
 * нужна (в отличие от app/(client)/settings, где клиент зовёт коллегу
 * сам и передать пароль лично некому).
 *
 * Ошибки — у своих полей (почта занята, пароли не совпадают), набранное
 * после отказа остаётся: раньше `action={formAction}` стирал всё, включая
 * имя и почту, из-за одного неверного пароля.
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
  const { state, fields, pending, formProps } = useFormAction(action, {}, { resetOnSuccess: true });

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />

      {noUsersYet && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Тариф на онбординге выбирает только «Администратор» — назначьте эту
          роль первому пользователю, остальным — уже по ролям.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Почта" error={fields.email}>
          <Input id="client-create-email" name="email" type="email" required placeholder="name@company.ru" />
        </Field>
        <Field label="Имя и фамилия" error={fields.fullName}>
          <Input id="client-create-fullName" name="fullName" required maxLength={120} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Пароль" error={fields.password}>
          <Input id="client-create-password" name="password" type="password" required minLength={10} />
        </Field>
        <Field label="Пароль ещё раз" error={fields.passwordConfirm}>
          <Input id="client-create-passwordConfirm" name="passwordConfirm" type="password" required minLength={10} />
        </Field>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Пароль сообщите клиенту лично — письма платформа не отправляет.
      </p>

      <Field label="Роль" error={fields.role} id="client-create-role">
        {(control) => (
          <Select name="role" defaultValue={noUsersYet ? "CLIENT_ADMIN" : "CLIENT_HIRING"}>
            <SelectTrigger {...control} className="w-full sm:w-60">
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
        )}
      </Field>

      <SubmitButton label="Создать аккаунт" pending="Создаём…" loading={pending} />
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
