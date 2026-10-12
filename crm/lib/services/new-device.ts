import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { brandedEmail } from "@/lib/notifications/email-brand";
import { appUrl } from "@/lib/urls";
import { DEFAULT_TIME_ZONE, formatInZone } from "@/lib/format-date";

/**
 * Уведомление «вход с нового устройства».
 *
 * Украденная cookie не оставляет следа во входах: пароль и 2FA не вводились.
 * Но вор открывает кабинет из другого браузера и системы, и это видно по
 * User-Agent. Если с такой комбинацией (браузер + система) этот человек за
 * последние 90 дней не входил, ему уходит письмо: настоящий владелец узнает
 * о чужом доступе и может завершить все сессии.
 *
 * Сравниваются браузер и система без номера версии: иначе каждое обновление
 * браузера выглядело бы новым устройством. Адрес в сравнении не участвует:
 * он меняется у любого человека с телефоном.
 *
 * Первый вход учётной записи (в журнале ещё ничего нет) не считается:
 * письмо «вы вошли впервые» ничего не даёт.
 */
const LOOKBACK_DAYS = 90;
const MAX_EVENTS = 300;

/** «Chrome 126, Windows» → «Chrome, Windows»: версию отбрасываем. */
export function deviceKey(describedUserAgent: string): string {
  return describedUserAgent.replace(/ \d+(?=,|$)/, "");
}

export async function isNewDevice(userId: string, userAgent: string | null): Promise<boolean> {
  const { describeUserAgent } = await import("@/lib/services/auth-events");
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const prior = await db.authEvent.findMany({
    where: { userId, kind: "LOGIN_OK", createdAt: { gte: since } },
    select: { userAgent: true },
    orderBy: { createdAt: "desc" },
    take: MAX_EVENTS,
  });
  if (prior.length === 0) return false;

  const current = deviceKey(describeUserAgent(userAgent));
  return !prior.some((event) => deviceKey(describeUserAgent(event.userAgent)) === current);
}

/** Письмо о входе с нового устройства. Никогда не бросает: сбой почты не должен мешать входу. */
export async function notifyNewDevice(params: {
  userId: string;
  userAgent: string | null;
  ip: string | null;
  at?: Date;
}): Promise<void> {
  try {
    const { describeUserAgent } = await import("@/lib/services/auth-events");
    const user = await db.user.findUnique({
      where: { id: params.userId },
      select: { email: true, fullName: true, isActive: true },
    });
    if (!user?.isActive) return;

    const device = describeUserAgent(params.userAgent);
    const when = `${formatInZone(params.at ?? new Date(), "dayMonthPaddedTime", DEFAULT_TIME_ZONE)} (МСК)`;
    const where = params.ip ? `, адрес ${params.ip}` : "";
    const line = `Вход в кабинет Fattakhov HR: ${when}, устройство «${device}»${where}.`;
    const advice =
      "Если это были вы, ничего делать не нужно. Если нет, войдите, откройте «Настройки» и нажмите " +
      "«Завершить все сессии», затем смените пароль и сообщите владельцу.";

    await getEmailTransport().send({
      to: user.email,
      subject: "Вход с нового устройства",
      text: [`${user.fullName}, здравствуйте!`, "", line, "", advice].join("\n"),
      html: brandedEmail({
        title: "Вход с нового устройства",
        preview: `Новый вход: ${device}`,
        heading: "Вход с нового устройства",
        paragraphs: [`${user.fullName}, здравствуйте!`, line, advice],
        action: { href: appUrl("/login"), label: "Открыть кабинет" },
      }),
    });
  } catch (error) {
    console.error("[вход с нового устройства] письмо не отправлено", error);
  }
}
