"use client";

import { startTransition, useActionState, useState } from "react";

import {
  FormMessages,
  ResetPasswordForm,
  SubmitButton,
  type AccountAction,
  type AccountFormState,
} from "@/components/shared/account-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}: {
  idPrefix: string;
  grants: TeamOption[];
  checked: string[];
}) {
  if (grants.length === 0) return null;
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">Доступы</legend>
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
    </fieldset>
  );
}

function RoleAndPosition({
  idPrefix,
  roles,
  role,
  position,
}: {
  idPrefix: string;
  roles: TeamOption[];
  role: string;
  position: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-position`}>Должность</Label>
        <Input
          id={`${idPrefix}-position`}
          name="position"
          maxLength={120}
          defaultValue={position}
          placeholder="Например, Администратор"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-role`}>Роль в CRM</Label>
        <Select name="role" defaultValue={role}>
          <SelectTrigger id={`${idPrefix}-role`} className="w-full">
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
      </div>
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
        {done && <p className="text-sm text-muted-foreground">{done}</p>}
      </div>
    );
  }

  const invite = mode === "invite";
  return (
    <div className="rounded-xl border p-5">
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
    </div>
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
  const [state, formAction] = useActionState<TeamFormState, FormData>(action, {});
  const defaultRole = roles.find((r) => r.value === "RECRUITER")?.value ?? roles[0]?.value ?? "";

  // Отправляем вручную, как и создание: после action формы React 19 очищает
  // поля, и при ошибке («адрес уже занят») пришлось бы отмечать всё заново
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="staff-invite-email">Почта</Label>
        <Input
          id="staff-invite-email"
          name="email"
          type="email"
          required
          placeholder="name@fattakhovhr.ru"
        />
      </div>
      <RoleAndPosition idPrefix="staff-invite" roles={roles} role={defaultRole} position="" />
      <GrantsFieldset idPrefix="staff-invite" grants={grants} checked={[]} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ссылка — пропуск в CRM с этой ролью и доступами: кто её открыл, тот и войдёт.
        Ошиблись в адресе — отзовите приглашение в списке «Ждут принятия» и отправьте заново.
      </p>
      <SubmitButton label="Пригласить" pending="Приглашаем…" />
      <FormMessages state={state} />
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
  const [state, formAction] = useActionState<TeamFormState, FormData>(action, {});
  const defaultRole = roles.find((r) => r.value === "RECRUITER")?.value ?? roles[0]?.value ?? "";

  // Отправляем вручную: после action формы React 19 очищает поля, и при ошибке
  // («пароли не совпадают») пришлось бы вводить всё заново
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="staff-create-email">Почта</Label>
          <Input
            id="staff-create-email"
            name="email"
            type="email"
            required
            placeholder="name@fattakhovhr.ru"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-create-fullName">Имя и фамилия</Label>
          <Input id="staff-create-fullName" name="fullName" required maxLength={120} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="staff-create-password">Пароль</Label>
          <Input id="staff-create-password" name="password" type="password" required minLength={10} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-create-passwordConfirm">Пароль ещё раз</Label>
          <Input id="staff-create-passwordConfirm" name="passwordConfirm" type="password" required minLength={10} />
        </div>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Пароль сообщите сотруднику лично — письма платформа не отправляет.
      </p>
      <RoleAndPosition idPrefix="staff-create" roles={roles} role={defaultRole} position="" />
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Роль определяет работу с вакансиями, кандидатами и счетами. Должность —
        любое название, её видят клиенты.
      </p>
      <GrantsFieldset idPrefix="staff-create" grants={grants} checked={[]} />
      <SubmitButton label="Создать аккаунт" pending="Создаём…" />
      <FormMessages state={state} />
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
  const [state, formAction] = useActionState<TeamFormState, FormData>(updateAction, {});
  const [activeState, activeFormAction] = useActionState<TeamFormState, FormData>(activeAction, {});
  const prefix = `staff-${member.id}`;

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">
        Изменить должность и доступы
      </summary>

      <form action={formAction} className="mt-4 space-y-5">
        <input type="hidden" name="userId" value={member.id} />
        <RoleAndPosition
          idPrefix={prefix}
          roles={roles}
          role={member.role}
          position={member.position ?? ""}
        />
        <GrantsFieldset idPrefix={prefix} grants={grants} checked={member.grants} />
        <SubmitButton label="Сохранить" pending="Сохраняем…" />
        <FormMessages state={state} />
      </form>

      <div className="mt-4 border-t pt-4">
        <ResetPasswordForm
          userId={member.id}
          action={resetPasswordAction}
          hint="Прежний пароль перестанет работать сразу — сообщите новый сотруднику лично."
        />
      </div>

      <form action={activeFormAction} className="mt-4 space-y-3 border-t pt-4">
        <input type="hidden" name="userId" value={member.id} />
        <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
        <Button type="submit" variant="outline" size="sm">
          {member.isActive ? "Отключить доступ" : "Вернуть доступ"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Отключённый сотрудник сразу теряет вход в CRM. Уже открытая панель
          студенческой платформы закроется не позже чем через восемь часов.
        </p>
        <FormMessages state={activeState} />
      </form>
    </details>
  );
}
