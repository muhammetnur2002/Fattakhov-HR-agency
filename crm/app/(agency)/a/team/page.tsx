import { withEmailOff } from "@/components/shared/email-off";
import { StaffCreateForm, StaffMemberEditor } from "@/components/team/staff-forms";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canManageStaffMember,
  effectiveGrants,
  STAFF_ROLES,
} from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { ROLE_LABELS, STAFF_GRANT_LABELS } from "@/lib/labels";
import { listStaff } from "@/lib/services/staff";

import {
  createStaffAction,
  resetStaffPasswordAction,
  setStaffActiveAction,
  updateStaffAction,
} from "./actions";

export const metadata = { title: "Сотрудники" };

/**
 * Команда агентства.
 *
 * Владелец заводит людям аккаунт с паролем, сам называет должность и
 * отмечает, чем
 * человеку можно управлять. Тот, кому он доверил команду, делает то же —
 * но не выше своей роли и только своими доступами. Кто что может,
 * решает lib/access; страница показывает только разрешённое.
 */
export default async function TeamPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "staff.manage");

  const { members } = await listStaff(actor);

  const roleOptions = STAFF_ROLES.filter((role) =>
    canManageStaffMember(actor, { role }),
  ).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  const grantOptions = effectiveGrants(actor).map((grant) => ({
    value: grant,
    label: STAFF_GRANT_LABELS[grant].label,
    hint: STAFF_GRANT_LABELS[grant].hint,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Сотрудники</h1>
        <p className="text-sm text-muted-foreground">
          Роль задаёт работу в CRM, должность — как человека видят клиенты,
          доступы — чем ещё ему можно управлять.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Создать аккаунт сотрудника</CardTitle>
          <CardDescription>
            Задайте пароль и сообщите его человеку лично — почта и пароль
            работают сразу, ссылка-приглашение не нужна.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffCreateForm action={createStaffAction} roles={roleOptions} grants={grantOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Команда</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {members.map((member) => (
            <div key={member.id} className="space-y-2.5 border-b pb-5 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="text-sm font-medium">
                    {member.fullName}
                    {member.isSelf && <span className="font-normal text-muted-foreground"> · это вы</span>}
                  </div>
                  <div className="text-xs break-words text-muted-foreground">
                    {withEmailOff(member.email, member.email)}
                    {member.position ? ` · ${member.position}` : ""}
                  </div>
                </div>
                <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                {!member.isActive && <Badge variant="destructive">Доступ отключён</Badge>}
                <div className="text-xs text-muted-foreground">
                  {member.lastLoginAt
                    ? `Заходил ${formatDate(member.lastLoginAt)}`
                    : "Ни разу не заходил"}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {member.role === "OWNER" ? (
                  <Badge variant="secondary">Все доступы</Badge>
                ) : member.grants.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Дополнительных доступов нет</span>
                ) : (
                  member.grants.map((grant) => (
                    <Badge key={grant} variant="secondary">
                      {STAFF_GRANT_LABELS[grant].label}
                    </Badge>
                  ))
                )}
              </div>

              {member.manageable && (
                <StaffMemberEditor
                  member={member}
                  roles={roleOptions}
                  grants={grantOptions}
                  updateAction={updateStaffAction}
                  activeAction={setStaffActiveAction}
                  resetPasswordAction={resetStaffPasswordAction}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
