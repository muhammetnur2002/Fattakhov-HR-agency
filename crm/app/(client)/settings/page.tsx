import { inviteTeammateAction } from "./actions";
import { InviteForm } from "@/components/clients/invite-form";
import { InviteLink } from "@/components/clients/invite-link";
import { withEmailOff } from "@/components/shared/email-off";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format-date";
import { ROLE_LABELS } from "@/lib/labels";
import { channelStatus } from "@/lib/notifications/channels";
import { listClientTeam } from "@/lib/services/clients";
import { getTwoFactorStatus } from "@/lib/services/two-factor";
import { appOrigin } from "@/lib/urls";

export const metadata = { title: "Настройки" };

export default async function ClientSettingsPage() {
  const actor = await requireClientActor();
  const canManageTeam =
    actor.clientId != null &&
    canDo(actor, "org.manageClientUsers", { clientId: actor.clientId });

  const [twoFactor, user, team] = await Promise.all([
    getTwoFactorStatus(actor.id),
    prisma.user.findFirst({
      where: { id: actor.id },
      select: {
        fullName: true,
        email: true,
        phone: true,
        position: true,
        telegramChatId: true,
        notifyPrefs: true,
      },
    }),
    canManageTeam ? listClientTeam(actor.clientId!) : null,
  ]);

  const prefs =
    typeof user?.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-sm text-muted-foreground">
          {user?.fullName} · {ROLE_LABELS[actor.role]}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Мои данные</CardTitle>
          <CardDescription>
            Имя и должность видит агентство и коллеги в кабинете; почту
            менять здесь нельзя — она привязана к входу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={user?.fullName ?? ""}
            phone={user?.phone ?? null}
            position={user?.position ?? null}
          />
        </CardContent>
      </Card>

      {/*
        Право приглашать коллег своей компании (org.manageClientUsers)
        у администратора клиента было с самого начала, но экрана для
        него не было — приглашать мог только агентский аккаунт-менеджер
        по просьбе клиента. Карточка — только для тех, у кого это право
        реально есть; для остальных клиентских ролей раздел не рендерится
        вовсе, а не показывается пустым или отключённым.
      */}
      {canManageTeam && team && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Команда</CardTitle>
            <CardDescription>
              Письма пока не отправляются — скопируйте ссылку и передайте
              сами. Срок действия ссылки 7 дней.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {team.users.length > 0 && (
              <div className="space-y-3 border-b pb-4">
                {team.users.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    <div className="min-w-48 flex-1">
                      <div className="text-sm font-medium">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {withEmailOff(u.email, u.email)}
                        {u.position ? ` · ${u.position}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{ROLE_LABELS[u.role]}</Badge>
                    <div className="text-xs text-muted-foreground">
                      {u.lastLoginAt
                        ? `Заходил ${formatDate(u.lastLoginAt)}`
                        : "Ни разу не заходил"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <InviteForm
              clientId={actor.clientId!}
              action={inviteTeammateAction}
              noUsersYet={team.users.length === 0}
            />

            {team.invitations.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-medium">
                  Ждут принятия ({team.invitations.length})
                </div>
                {team.invitations.map((inv) => (
                  <div key={inv.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{withEmailOff(inv.email, inv.email)}</span>
                      <Badge variant="outline">{ROLE_LABELS[inv.role]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        до {formatDate(inv.expiresAt)}
                      </span>
                    </div>
                    <InviteLink url={`${appOrigin()}/invite/${inv.token}`} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Двухфакторная аутентификация
          </CardTitle>
          <CardDescription>
            Второй шаг при входе: код из приложения на телефоне. Пароль
            без него не пускает.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSettings status={twoFactor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Пароль</CardTitle>
          <CardDescription>
            После смены на других устройствах вход придётся выполнить
            заново. Здесь это защита, а не неудобство: если пароль сменили
            из-за подозрений, старая сессия не должна пережить смену.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Уведомления</CardTitle>
          <CardDescription>
            Что приходит помимо самого кабинета. В интерфейсе уведомления
            есть всегда.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings
            email={prefs.email !== false}
            telegram={prefs.telegram === true}
            telegramChatId={user?.telegramChatId ?? null}
            channelsConfigured={channelStatus()}
            categories={
              typeof prefs.categories === "object" && prefs.categories !== null
                ? (prefs.categories as Record<string, boolean>)
                : {}
            }
            hideCategories={["leads"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
