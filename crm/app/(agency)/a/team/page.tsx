import { PresenceRefresh } from "@/components/presence/presence-refresh";
import { StaffAddPanel } from "@/components/team/staff-forms";
import { StaffInvitations } from "@/components/team/staff-invitations";
import { TeamList } from "@/components/team/team-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canDo,
  canManageStaffMember,
  effectiveGrants,
  STAFF_ROLES,
} from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { ROLE_LABELS, STAFF_GRANT_LABELS } from "@/lib/labels";
import { listStaff, listStaffInvitations } from "@/lib/services/staff";
import { appOrigin } from "@/lib/urls";

import {
  createStaffAction,
  inviteStaffAction,
  resetStaffPasswordAction,
  resetStaffTwoFactorAction,
  revokeStaffInvitationAction,
  setStaffActiveAction,
  updateStaffAction,
} from "./actions";

export const metadata = { title: "Сотрудники" };

/**
 * Команда агентства.
 *
 * Владелец заводит людям аккаунт с паролем или зовёт их письмом со
 * ссылкой, сам называет должность и отмечает, чем человеку можно
 * управлять. Тот, кому он доверил команду, делает то же —
 * но не выше своей роли и только своими доступами. Кто что может,
 * решает lib/access; страница показывает только разрешённое.
 */
export default async function TeamPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "staff.manage");

  const [{ members }, invitations] = await Promise.all([
    listStaff(actor),
    listStaffInvitations(actor),
  ]);

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
      {/* «В сети» у сотрудников обновляется вместе со страницей */}
      <PresenceRefresh />
      <div>
        <h1 className="text-2xl font-semibold">Сотрудники</h1>
        <p className="text-sm text-muted-foreground">
          Роль задаёт работу в CRM, должность — как человека видят клиенты,
          доступы — чем ещё ему можно управлять.
        </p>
      </div>

      <StaffAddPanel
        createAction={createStaffAction}
        inviteAction={inviteStaffAction}
        roles={roleOptions}
        grants={grantOptions}
      />

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ждут принятия ({invitations.length})
            </CardTitle>
            <CardDescription>
              Приглашённому уходит письмо со ссылкой; не дошло — скопируйте её
              здесь и передайте сами. На экране она скрыта: кто её увидел, тот
              и войдёт. Ошиблись в адресе — отзовите и пригласите заново.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffInvitations
              invitations={invitations.map(({ token, ...invitation }) => ({
                ...invitation,
                url: token ? `${appOrigin()}/invite/${token}` : null,
              }))}
              revokeAction={revokeStaffInvitationAction}
            />
          </CardContent>
        </Card>
      )}

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
            resetTwoFactorAction={canDo(actor, "staff.resetTwoFactor") ? resetStaffTwoFactorAction : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
