import Link from "next/link";

import { ContractTemplateManager } from "@/components/clients/contract-template-manager";
import { AlertCheck } from "@/components/settings/alert-check";
import { VkEventsCard } from "@/components/settings/vk-events-card";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordForm } from "@/components/settings/password-form";
import { PresenceCard } from "@/components/settings/presence-card";
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
import { channelStatus, vkMessageUrl } from "@/lib/notifications/channels";
import { listVkEvents } from "@/lib/notifications/vk-events";
import { listPushDevices } from "@/lib/notifications/push";
import { pushPublicKey } from "@/lib/notifications/push-config";
import { formatDate } from "@/lib/format-date";
import { getContractTemplate } from "@/lib/services/contract-documents";
import { getTwoFactorStatus } from "@/lib/services/two-factor";

export const metadata = { title: "Настройки" };

export default async function AgencySettingsPage() {
  const actor = await requireAgencyActor();
  const twoFactor = await getTwoFactorStatus(actor.id);
  const canManageContract = canDo(actor, "agreement.manage", { clientId: null });
  const template = canManageContract ? await getContractTemplate(actor.organizationId) : null;

  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: {
      fullName: true,
      email: true,
      vkUserId: true,
      notifyPrefs: true,
      showPresence: true,
    },
  });

  const prefs =
    typeof user?.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};

  // Ключ — на запрос, не при сборке (см. lib/notifications/push-config.ts)
  const pushKey = pushPublicKey();
  const pushDevices = pushKey ? await listPushDevices(actor.id) : [];

  // Журнал событий ВК — только владельцу и только когда ВК подключён
  const vkEvents =
    canDo(actor, "org.settings") && channelStatus().vk ? await listVkEvents(10) : null;

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
            без него не пускает. Для сотрудников агентства обязательна.
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

      <PresenceCard role={actor.role} showPresence={user?.showPresence ?? true} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Уведомления</CardTitle>
          <CardDescription>
            На почту приходит всё, срочное дублируется во ВКонтакте, если он
            подключён. В интерфейсе уведомления есть всегда.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings
            email={prefs.email !== false}
            vk={prefs.vk !== false}
            vkUserId={user?.vkUserId ?? null}
            vkMessageUrl={vkMessageUrl()}
            push={prefs.push !== false}
            pushPublicKey={pushKey}
            pushDevices={pushDevices}
            channelsConfigured={channelStatus()}
            categories={
              typeof prefs.categories === "object" && prefs.categories !== null
                ? (prefs.categories as Record<string, boolean>)
                : {}
            }
          />
        </CardContent>
      </Card>

      {/*
        Канал сбоев снаружи ничем себя не проявляет: пока ничего не упало,
        неработающий он выглядит ровно как работающий. Проверять его —
        отдельное действие, и нужно оно не один раз: сменили пароль
        от ящика или перевыпустили токен бота — канал замолчал молча.
      */}
      {canDo(actor, "org.settings") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сообщения о сбоях</CardTitle>
            <CardDescription>
              Когда в платформе что-то ломается, разбор уходит письмом
              на отдельный ящик, а короткий сигнал — владельцам во ВКонтакте,
              у кого он привязан, и на устройства, где
              включены уведомления. Кнопка отправляет настоящее сообщение
              каждым каналом: проверка имитацией ничего не доказывает.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertCheck />
          </CardContent>
        </Card>
      )}

      {vkEvents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ВКонтакте: что приходит от сообщества</CardTitle>
            <CardDescription>
              Последние события от сообщества агентства и чем они закончились.
              По этому списку видно, на каком шаге рвётся привязка: ВКонтакте
              ничего не присылает, секретный ключ не совпал или ответить
              человеку не вышло. Хранится 30 дней, текст сообщений не сохраняется.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VkEventsCard events={vkEvents} />
          </CardContent>
        </Card>
      )}

      {canManageContract && (
        <Card id="contract-template">
          <CardHeader>
            <CardTitle className="text-base">Договор для клиентов</CardTitle>
            <CardDescription>
              Шаблон, который клиенты без договора скачивают в разделе «Документы», подписывают и присылают вам на
              проверку. Можно заменить новым файлом или удалить.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContractTemplateManager
              current={
                template
                  ? { fileName: template.fileName, uploadedAt: formatDate(template.createdAt), url: template.url }
                  : null
              }
            />
          </CardContent>
        </Card>
      )}

      {canDo(actor, "auth.log") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Журнал входов</CardTitle>
            <CardDescription>
              Кто и откуда входил в кабинет, неудачные попытки, сброс паролей
              и включение двухфакторной. Записи хранятся 90 дней. Только для
              владельца.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/a/settings/auth-log">Открыть</Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
