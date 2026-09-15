import Link from "next/link";

import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordForm } from "@/components/settings/password-form";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { channelStatus } from "@/lib/notifications/channels";
import { getTwoFactorStatus } from "@/lib/services/two-factor";

export const metadata = { title: "Настройки" };

export default async function AgencySettingsPage() {
  const actor = await requireAgencyActor();
  const twoFactor = await getTwoFactorStatus(actor.id);

  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: {
      fullName: true,
      email: true,
      telegramChatId: true,
      notifyPrefs: true,
    },
  });

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
            Срочное приходит в Telegram, остальное на почту. В интерфейсе
            уведомления есть всегда.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings
            email={prefs.email !== false}
            telegram={prefs.telegram !== false}
            telegramChatId={user?.telegramChatId ?? null}
            channelsConfigured={channelStatus()}
            categories={
              typeof prefs.categories === "object" && prefs.categories !== null
                ? (prefs.categories as Record<string, boolean>)
                : {}
            }
          />
        </CardContent>
      </Card>

      {canDo(actor, "pdn.auditLog") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Персональные данные</CardTitle>
            <CardDescription>
              Журнал доступа сотрудников к данным кандидатов и удаление
              по истечении согласия. Только для владельца.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/a/settings/pdn">Открыть</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {canDo(actor, "staff.manage") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сотрудники</CardTitle>
            <CardDescription>
              Пригласить в команду, назвать должность и выдать доступы —
              в том числе к студенческой платформе.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/a/team">Открыть</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Настройки организации</CardTitle>
          <CardDescription>
            Шаблон воронки и тарифные пресеты появятся здесь позже.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
