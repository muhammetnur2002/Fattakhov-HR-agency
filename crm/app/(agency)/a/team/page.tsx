import { StaffCreateForm } from "@/components/team/staff-forms";
import { TeamList } from "@/components/team/team-list";
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
        <CardContent>
          <TeamList
            members={members}
            roles={roleOptions}
            grants={grantOptions}
            updateAction={updateStaffAction}
            activeAction={setStaffActiveAction}
            resetPasswordAction={resetStaffPasswordAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
