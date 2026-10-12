"use client";

import { useActionState, useState } from "react";

import {
  ResetPasswordForm,
  SubmitButton,
  type AccountAction,
  type AccountFormState,
} from "@/components/shared/account-forms";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldSet } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { useFormAction } from "@/lib/hooks/use-form-action";

export type TeamFormState = AccountFormState;
type TeamAction = AccountAction;

export type TeamOption = { value: string; label: string; hint?: string };

/**
 * Доступы галочками. Показываются только те, что есть у самого
 * управляющего: раздать больше своего нельзя (lib/access, canAssignStaff).
 */
function GrantsFieldset({
  idPrefix,
  grants,
  checked,
  error,
}: {
  idPrefix: string;
  grants: TeamOption[];
  checked: string[];
  error?: string;
}) {
  if (grants.length === 0) return null;
  return (
    <FieldSet id={`${idPrefix}-grants`} legend="Доступы" error={error}>
      {grants.map((grant) => (
        <div key={grant.value} className="flex items-start gap-3">
          <Checkbox
            id={`${idPrefix}-${grant.value}`}
            name="grants"
            value={grant.value}
            defaultChecked={checked.includes(grant.value)}
            className="mt-0.5"
          />
          <div className="grid gap-0.5">
            <Label htmlFor={`${idPrefix}-${grant.value}`} className="font-normal">
              {grant.label}
            </Label>
            {grant.hint && (
              <p className="text-xs leading-relaxed text-muted-foreground">{grant.hint}</p>
            )}
          </div>
        </div>
      ))}
    </FieldSet>
  );
}

function RoleAndPosition({
  idPrefix,
  roles,
  role,
  position,
  errors = {},
}: {
  idPrefix: string;
  roles: TeamOption[];
  role: string;
  position: string;
  errors?: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Должность" error={errors.position}>
        <Input
          id={`${idPrefix}-position`}
          name="position"
          maxLength={120}
          defaultValue={position}
          placeholder="Например, Администратор"
        />
      </Field>
      <Field label="Роль в CRM" error={errors.role} id={`${idPrefix}-role`}>
        {(control) => (
          <Select name="role" defaultValue={role}>
            <SelectTrigger {...control} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  );
}

/**
 * Новый сотрудник по требованию: на странице только кнопки и список команды,
 * бланк раскрывается по нажатию, а после успеха сворачивается обратно.
 *
 * Путей два, и каждый для своего случая. Аккаунт с паролем — когда человек
 * рядом и войти надо сейчас: пароль вы сообщаете лично. Приглашение по
 * почте — когда пароль передать некому: человек получает письмо и задаёт
 * пароль сам, а ссылка остаётся в списке «Ждут принятия» на случай, если
 * письмо не дойдёт. Права у обоих путей одинаковые.
 */
export function StaffAddPanel({
  createAction,
  inviteAction,
  roles,
  grants,
}: {
  createAction: TeamAction;
  inviteAction: TeamAction;
  roles: TeamOption[];
  grants: TeamOption[];
}) {
  const [mode, setMode] = useState<"create" | "invite" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Успех закрывает бланк; сообщение остаётся над списком, чтобы было видно, что получилось
  const wrap =
    (action: TeamAction): TeamAction =>
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        setDone(result.ok);
        setMode(null);
      }
      return result;
    };

  function open(next: "create" | "invite") {
    setDone(null);
    setMode(next);
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => open("create")}>
          Создать аккаунт сотрудника
        </Button>
        <Button type="button" variant="outline" onClick={() => open("invite")}>
          Пригласить по почте
        </Button>
        <FormMessage compact ok={done} className="text-sm" />
      </div>
    );
  }

  const invite = mode === "invite";
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {invite ? "Приглашение в команду" : "Новый сотрудник"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {invite
              ? "Человеку уйдёт письмо со ссылкой — пароль он задаст сам. Ссылка действует 7 дней."
              : "Задайте пароль и сообщите его человеку лично — почта и пароль работают сразу, ссылка-приглашение не нужна."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
          Отмена
        </Button>
      </div>
      {invite ? (
        <StaffInviteForm action={wrap(inviteAction)} roles={roles} grants={grants} />
      ) : (
        <StaffCreateForm action={wrap(createAction)} roles={roles} grants={grants} />
      )}
    </Panel>
  );
}

/**
 * Приглашение по почте: почта, роль, должность и доступы — всё, кроме
 * пароля и имени, их человек укажет сам по ссылке.
 */
export function StaffInviteForm({
  action,
  roles,
  grants,
}: {
  action: TeamAction;
  roles: TeamOption[];
  grants: TeamOption[];
}) {
  // Форма уходит через useFormAction: после action формы React 19 очищает поля, и при ошибке
  // («адрес уже занят») пришлось бы отмечать всё заново
  const { state, fields, pending, formProps } = useFormAction(action, {}, { resetOnSuccess: true });
  const defaultRole = roles.find((r) => r.value === "RECRUITER")?.value ?? roles[0]?.value ?? "";

  return (
    <form {...formProps} className="space-y-4">
      <Field label="Почта" error={fields.email}>
        <Input
          id="staff-invite-email"
          name="email"
          type="email"
          required
          placeholder="name@fattakhovhr.ru"
        />
      </Field>
      <RoleAndPosition
        idPrefix="staff-invite"
        roles={roles}
        role={defaultRole}
        position=""
        errors={fields}
      />
      <GrantsFieldset idPrefix="staff-invite" grants={grants} checked={[]} error={fields.grants} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ссылка — пропуск в CRM с этой ролью и доступами: кто её открыл, тот и войдёт.
        Ошиблись в адресе — отзовите приглашение в списке «Ждут принятия» и отправьте заново.
      </p>
      <SubmitButton label="Пригласить" pending="Приглашаем…" loading={pending} />
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function StaffCreateForm({
  action,
  roles,
  grants,
}: {
  action: TeamAction;
  roles: TeamOption[];
  grants: TeamOption[];
}) {
  // Набранное остаётся после отказа («пароли не совпадают»); успех очищает форму, в том числе пароли
  const { state, fields, pending, formProps } = useFormAction(action, {}, { resetOnSuccess: true });
  const defaultRole = roles.find((r) => r.value === "RECRUITER")?.value ?? roles[0]?.value ?? "";

  return (
    <form {...formProps} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Почта" error={fields.email}>
          <Input
            id="staff-create-email"
            name="email"
            type="email"
            required
            placeholder="name@fattakhovhr.ru"
          />
        </Field>
        <Field label="Имя и фамилия" error={fields.fullName}>
          <Input id="staff-create-fullName" name="fullName" required maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Пароль" error={fields.password}>
          <Input id="staff-create-password" name="password" type="password" required minLength={10} />
        </Field>
        <Field label="Пароль ещё раз" error={fields.passwordConfirm}>
          <Input id="staff-create-passwordConfirm" name="passwordConfirm" type="password" required minLength={10} />
        </Field>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Пароль сообщите сотруднику лично — письма платформа не отправляет.
      </p>
      <RoleAndPosition
        idPrefix="staff-create"
        roles={roles}
        role={defaultRole}
        position=""
        errors={fields}
      />
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Роль определяет работу с вакансиями, кандидатами и счетами. Должность —
        любое название, её видят клиенты.
      </p>
      <GrantsFieldset idPrefix="staff-create" grants={grants} checked={[]} error={fields.grants} />
      <SubmitButton label="Создать аккаунт" pending="Создаём…" loading={pending} />
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function StaffMemberEditor({
  member,
  roles,
  grants,
  updateAction,
  activeAction,
  resetPasswordAction,
}: {
  member: { id: string; role: string; position: string | null; grants: string[]; isActive: boolean };
  roles: TeamOption[];
  grants: TeamOption[];
  updateAction: TeamAction;
  activeAction: TeamAction;
  resetPasswordAction: TeamAction;
}) {
  const { state, fields, pending, formProps } = useFormAction(updateAction, {});
  const [activeState, activeFormAction] = useActionState<TeamFormState, FormData>(activeAction, {});
  const prefix = `staff-${member.id}`;

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">
        Изменить должность и доступы
      </summary>

      <form {...formProps} className="mt-4 space-y-4">
        <input type="hidden" name="userId" value={member.id} />
        <RoleAndPosition
          idPrefix={prefix}
          roles={roles}
          role={member.role}
          position={member.position ?? ""}
          errors={fields}
        />
        <GrantsFieldset idPrefix={prefix} grants={grants} checked={member.grants} error={fields.grants} />
        <SubmitButton label="Сохранить" pending="Сохраняем…" loading={pending} />
        <FormMessage error={state.error} ok={state.ok} />
      </form>

      <div className="mt-4 border-t pt-4">
        <ResetPasswordForm
          userId={member.id}
          action={resetPasswordAction}
          hint="Прежний пароль перестанет работать сразу — сообщите новый сотруднику лично."
        />
      </div>

      <form action={activeFormAction} className="mt-4 space-y-4 border-t pt-4">
        <input type="hidden" name="userId" value={member.id} />
        <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
        <SubmitButtonBase variant="outline" size="sm">
          {member.isActive ? "Отключить доступ" : "Вернуть доступ"}
        </SubmitButtonBase>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Отключённый сотрудник сразу теряет вход в CRM. Уже открытая панель
          студенческой платформы закроется не позже чем через восемь часов.
        </p>
        <FormMessage error={activeState.error} ok={activeState.ok} />
      </form>
    </details>
  );
}
