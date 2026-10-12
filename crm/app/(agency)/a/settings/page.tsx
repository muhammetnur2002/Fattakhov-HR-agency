import { ContractTemplateManager } from "@/components/clients/contract-template-manager";
import { AlertCheck } from "@/components/settings/alert-check";
import { VkEventsCard } from "@/components/settings/vk-events-card";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordForm } from "@/components/settings/password-form";
import { SessionLimitsCard } from "@/components/settings/session-limits-card";
import { SessionsCard } from "@/components/settings/sessions-card";
import { PresenceCard } from "@/components/settings/presence-card";
import {
  SettingsLinkCard,
  SettingsNav,
  SettingsSection,
  type SettingsSectionMeta,
} from "@/components/settings/settings-sections";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { getUserTimeZone, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { channelStatus, vkMessageUrl } from "@/lib/notifications/channels";
import { listVkEvents } from "@/lib/notifications/vk-events";
import { listPushDevices } from "@/lib/notifications/push";
import { pushPublicKey } from "@/lib/notifications/push-config";
import { formatDate } from "@/lib/format-date";
import { getContractTemplate } from "@/lib/services/contract-documents";
import { getSessionLimits } from "@/lib/services/session-settings";
import { getTwoFactorStatus } from "@/lib/services/two-factor";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Настройки" };

/**
 * Четыре раздела вместо десяти карточек подряд (замер 12.10.2026: 4507px на ноутбуке, 4231 на
 * телефоне, ни одного заголовка выше карточки). Порядок — от того, что нужно каждому, к тому, что
 * доступно только владельцу. Раздел без карточек не рисуется и в навигацию не попадает.
 */
const SECTIONS = {
  security: {
    id: "security",
    title: "Безопасность входа",
    short: "Безопасность",
    description: "Второй шаг при входе, пароль и устройства, на которых вы вошли.",
  },
  notifications: {
    id: "notifications",
    title: "Уведомления и каналы",
    short: "Уведомления",
    description: "Куда приходят сообщения о событиях, что видят о вас другие и как проверить, что каналы работают.",
  },
  organization: {
    id: "organization",
    title: "Организация и команда",
    short: "Организация",
    description: "Команда, договор для клиентов и общие настройки агентства.",
  },
  data: {
    id: "data",
    title: "Журналы и персональные данные",
    short: "Журналы и данные",
    description: "Кто входил в кабинет и как хранятся данные кандидатов. Только для владельца.",
  },
} satisfies Record<string, SettingsSectionMeta>;

export default async function AgencySettingsPage() {
  const actor = await requireAgencyActor();
  const timeZone = await getUserTimeZone();
  const twoFactor = await getTwoFactorStatus(actor.id);
  const canManageContract = canDo(actor, "agreement.manage", { clientId: null });
  const template = canManageContract ? await getContractTemplate(actor.organizationId) : null;
  const sessionLimits = canDo(actor, "org.settings") ? await getSessionLimits(actor.organizationId) : null;

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

  // Права — флагами в одном месте: разметка ниже ролей не проверяет (lib/access)
  const canOrgSettings = canDo(actor, "org.settings");
  const canAuthLog = canDo(actor, "auth.log");
  const canPdnLog = canDo(actor, "pdn.auditLog");
  const canManageStaff = canDo(actor, "staff.manage");

  // Журнал событий ВК — только владельцу и только когда ВК подключён
  const vkEvents = canOrgSettings && channelStatus().vk ? await listVkEvents(10) : null;

  const showData = canAuthLog || canPdnLog;
  const navSections = [
    SECTIONS.security,
    SECTIONS.notifications,
    SECTIONS.organization,
    ...(showData ? [SECTIONS.data] : []),
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <PageTitle>Настройки</PageTitle>
        <p className="text-sm text-muted-foreground">
          {user?.fullName} · {ROLE_LABELS[actor.role]}
        </p>
      </div>

      <SettingsNav sections={navSections} />

      <SettingsSection meta={SECTIONS.security}>
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-base">
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
            <CardTitle as="h3" className="text-base">Пароль</CardTitle>
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
            <CardTitle as="h3" className="text-base">Сессии</CardTitle>
            <CardDescription>
              Выйти на всех устройствах сразу, если есть подозрение на чужой доступ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionsCard />
          </CardContent>
        </Card>

        {sessionLimits && (
          <Card>
            <CardHeader>
              <CardTitle as="h3" className="text-base">Срок сессии</CardTitle>
              <CardDescription>
                Как долго можно оставаться в кабинете после входа. Чем короче срок, тем меньше шансов у
                украденной cookie, но тем чаще вход.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SessionLimitsCard limits={sessionLimits} />
            </CardContent>
          </Card>
        )}
      </SettingsSection>

      <SettingsSection meta={SECTIONS.notifications}>
        <PresenceCard role={actor.role} showPresence={user?.showPresence ?? true} headingLevel="h3" />

        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-base">Уведомления</CardTitle>
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
        {canOrgSettings && (
          <Card>
            <CardHeader>
              <CardTitle as="h3" className="text-base">Сообщения о сбоях</CardTitle>
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
              <CardTitle as="h3" className="text-base">ВКонтакте: что приходит от сообщества</CardTitle>
              <CardDescription>
                Что бот сделал с сообщениями сообщества агентства и чем это
                кончилось: запустился ли, привязал ли страницу, смог ли ответить.
                По списку видно, на каком шаге рвётся привязка. Хранится 30
                дней, текст сообщений не сохраняется.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VkEventsCard events={vkEvents} timeZone={timeZone} />
            </CardContent>
          </Card>
        )}
      </SettingsSection>

      <SettingsSection meta={SECTIONS.organization}>
        {canManageStaff && (
          <SettingsLinkCard
            title="Сотрудники"
            description="Пригласить в команду, назвать должность и выдать доступы — в том числе к студенческой платформе."
            href="/a/team"
          />
        )}

        {canManageContract && (
          <Card id="contract-template">
            <CardHeader>
              <CardTitle as="h3" className="text-base">Договор для клиентов</CardTitle>
              <CardDescription>
                Шаблон, который клиенты без договора скачивают в разделе «Документы», подписывают и присылают вам на
                проверку. Можно заменить новым файлом или удалить.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContractTemplateManager
                current={
                  template
                    ? { fileName: template.fileName, uploadedAt: formatDate(template.createdAt, timeZone), url: template.url }
                    : null
                }
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-base">Настройки организации</CardTitle>
            <CardDescription>
              Шаблон воронки и тарифные пресеты появятся здесь позже.
            </CardDescription>
          </CardHeader>
        </Card>
      </SettingsSection>

      {showData && (
        <SettingsSection meta={SECTIONS.data}>
          {canAuthLog && (
            <SettingsLinkCard
              title="Журнал входов"
              description="Кто и откуда входил в кабинет, неудачные попытки, сброс паролей и включение двухфакторной. Записи хранятся 90 дней. Только для владельца."
              href="/a/settings/auth-log"
            />
          )}

          {canPdnLog && (
            <SettingsLinkCard
              title="Персональные данные"
              description="Журнал доступа сотрудников к данным кандидатов и удаление по истечении согласия. Только для владельца."
              href="/a/settings/pdn"
            />
          )}
        </SettingsSection>
      )}
    </div>
  );
}
