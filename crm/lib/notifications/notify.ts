import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { resolveLink, type NotificationLink } from "./links";
import { getEmailTransport, getTelegramTransport } from "./channels";
import {
  channelsForSide,
  eventDefinition,
  plural,
  EVENTS,
  type Channel,
  type EventCategory,
  type EventCode,
} from "./events";
import { appOrigin } from "@/lib/urls";

/**
 * Окно схлопывания (BR-30).
 *
 * Пять кандидатов, представленных за десять минут, не должны
 * превратиться в пять писем. Первое уходит сразу — реакция важна,
 * остальные копятся и уходят одной сводкой при следующем проходе
 * фонового обработчика.
 */
const COLLAPSE_WINDOW_MINUTES = 15;

export type NotifyParams = {
  organizationId: string;
  /** Кому. Автор события в получателях быть не должен — отсеиваем заранее. */
  userIds: string[];
  event: EventCode;
  title: string;
  body?: string;
  /**
   * Куда ведёт уведомление.
   *
   * Строка — когда адрес один для всех: получатель заведомо с одной
   * стороны либо путь общий (корень «/» прокси разводит сам).
   * Объект из ./links — когда страница в кабинетах разная, а
   * получатели бывают с обеих сторон.
   */
  linkUrl?: NotificationLink;
  /** Ключ схлопывания: обычно id вакансии. */
  groupKey?: string;
  payload?: Record<string, unknown>;
};

type UserPrefs = {
  id: string;
  email: string;
  telegramChatId: string | null;
  notifyPrefs: unknown;
  /** null у сотрудников агентства, заполнен у пользователей клиента. */
  clientId: string | null;
  /** Определяет кабинет, а значит и адрес ссылки. */
  role: UserRole;
};

/**
 * Какие каналы включены у человека.
 *
 * Настройки хранятся как JSON, поэтому читаем защитно: неизвестная
 * или битая структура должна давать разумное поведение, а не падение
 * посреди отправки.
 *
 * Категория события проверяется отдельно от канала (BR по настройкам
 * уведомлений): раньше можно было выключить только письма целиком,
 * теперь — «письма про счета», оставив «письма про кандидатов».
 * Отсутствие ключа в categories значит «включено» — так добавление
 * новой категории в будущем не отключает её всем молча.
 */
function enabledChannels(
  user: UserPrefs,
  defaults: Channel[],
  category: EventCategory,
): Channel[] {
  const prefs =
    typeof user.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};

  const categories =
    typeof prefs.categories === "object" && prefs.categories !== null
      ? (prefs.categories as Record<string, unknown>)
      : {};

  if (categories[category] === false) return [];

  // Клиенту Telegram только по его собственной привязке
  const allowed = channelsForSide(
    defaults,
    user.clientId === null,
    Boolean(user.telegramChatId),
  );

  return allowed.filter((channel) => {
    if (prefs[channel] === false) return false;
    // Telegram без привязанного чата отправить некуда
    if (channel === "telegram" && !user.telegramChatId) return false;
    return true;
  });
}

/**
 * Создать уведомления и разослать по каналам.
 *
 * Никогда не бросает: сбой доставки не должен ронять действие,
 * которое её вызвало. Клиент не должен получить ошибку в ответ
 * на «отказать кандидату» из-за недоступного SMTP.
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    await deliver(params);
  } catch (error) {
    console.error(`[уведомления] сбой на событии ${params.event}`, error);
  }
}

async function deliver(params: NotifyParams): Promise<void> {
  const recipients = [...new Set(params.userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const definition = eventDefinition(params.event);

  const users = await prisma.user.findMany({
    where: { id: { in: recipients }, isActive: true },
    select: {
      id: true,
      email: true,
      telegramChatId: true,
      notifyPrefs: true,
      clientId: true,
      role: true,
    },
  });

  const since = new Date(Date.now() - COLLAPSE_WINDOW_MINUTES * 60_000);

  for (const user of users) {
    /*
      Адрес выбирается под получателя.

      Одна и та же карточка лежит в кабинетах по разным путям, а
      получателей у события часто двое сразу — рекрутёр и заказчик.
      Разрешаем здесь, а не на месте вызова: в записи уведомления
      должна лежать уже готовая ссылка, потому что сводка (flushCollapsed)
      берёт её из базы и про роль знать не обязана.
    */
    const linkUrl = resolveLink(params.linkUrl, user.role);

    const channels = enabledChannels(
      user,
      [...definition.channels],
      definition.category,
    );

    // Было ли по этому же поводу что-то отправлено недавно
    const recentlySent = params.groupKey
      ? await prisma.notification.findFirst({
          where: {
            userId: user.id,
            eventCode: params.event,
            groupKey: params.groupKey,
            createdAt: { gte: since },
            OR: [
              { sentEmailAt: { not: null } },
              { sentTelegramAt: { not: null } },
            ],
          },
          select: { id: true },
        })
      : null;

    const notification = await prisma.notification.create({
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        eventCode: params.event,
        title: params.title,
        body: params.body,
        linkUrl,
        groupKey: params.groupKey,
        payload: params.payload as never,
        // Если в окне уже что-то ушло — не шлём сразу, ждём сводки
        pendingChannels: recentlySent ? channels : [],
      },
      select: { id: true },
    });

    if (recentlySent) continue;

    await sendToChannels(notification.id, user, channels, {
      title: params.title,
      body: params.body,
      linkUrl,
      event: params.event,
    });
  }
}

/**
 * Нейтральный текст для Telegram.
 *
 * В Telegram не уходит ничего о человеке: ни ФИО, ни телефона,
 * ни компании, ни зарплаты. Только название события и ссылка,
 * за которой требуется вход в платформу.
 *
 * Причина не в осторожности, а в архитектуре локализации: Telegram
 * это иностранный сервис, и персональные данные кандидатов туда
 * попадать не должны (юридический пакет, раздел 19; угроза T17
 * модели угроз). Письмо на российский SMTP - другое дело, там
 * подробности допустимы.
 */
function neutralTelegramText(event: EventCode, count: number): string {
  const name = eventDefinition(event).description;
  return count > 1 ? `${name}: ${count}` : name;
}

async function sendToChannels(
  notificationId: string,
  user: UserPrefs,
  channels: Channel[],
  content: {
    title: string;
    body?: string;
    linkUrl?: string;
    event: EventCode;
    /** Сколько событий схлопнуто в одно сообщение. */
    count?: number;
  },
): Promise<void> {
  const baseUrl = appOrigin();
  const url = content.linkUrl ? `${baseUrl}${content.linkUrl}` : undefined;

  const sent: Record<string, Date> = {};

  if (channels.includes("email")) {
    await getEmailTransport().send({
      to: user.email,
      subject: content.title,
      text: [content.body, url].filter(Boolean).join("\n\n"),
    });
    sent.sentEmailAt = new Date();
  }

  if (channels.includes("telegram") && user.telegramChatId) {
    await getTelegramTransport().send({
      chatId: user.telegramChatId,
      text: neutralTelegramText(content.event, content.count ?? 1),
      url,
      urlLabel: "Открыть в платформе",
    });
    sent.sentTelegramAt = new Date();
  }

  if (Object.keys(sent).length > 0) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: sent,
    });
  }
}

/**
 * Разослать накопившиеся сводки (BR-30).
 *
 * Вызывается фоновым обработчиком. Берёт уведомления, отложенные
 * схлопыванием, группирует и отправляет по одному сообщению на группу:
 * «ещё 4 кандидата по вакансии Руководитель отдела продаж».
 */
export async function flushCollapsed(): Promise<number> {
  const pending = await prisma.notification.findMany({
    where: {
      pendingChannels: { isEmpty: false },
      // Даём окну закрыться, иначе сводка уйдёт посреди пачки
      createdAt: { lte: new Date(Date.now() - 2 * 60_000) },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      userId: true,
      eventCode: true,
      groupKey: true,
      title: true,
      linkUrl: true,
      pendingChannels: true,
    },
  });

  if (pending.length === 0) return 0;

  // Группируем по получателю и поводу
  const groups = new Map<string, typeof pending>();
  for (const item of pending) {
    const key = `${item.userId}|${item.eventCode}|${item.groupKey ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(pending.map((p) => p.userId))] } },
    select: {
      id: true,
      email: true,
      telegramChatId: true,
      notifyPrefs: true,
      clientId: true,
      role: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  let sentGroups = 0;

  for (const items of groups.values()) {
    const user = byId.get(items[0].userId);
    if (!user) continue;

    const count = items.length;
    const title =
      count === 1
        ? items[0].title
        : `${count} ${plural(count, "новое событие", "новых события", "новых событий")}`;

    const body =
      count === 1
        ? undefined
        : items
            .slice(0, 5)
            .map((i) => `— ${i.title}`)
            .join("\n");

    await sendToChannels(items[0].id, user, items[0].pendingChannels as Channel[], {
      title,
      body,
      linkUrl: items[0].linkUrl ?? undefined,
      event: items[0].eventCode as EventCode,
      count,
    });

    await prisma.notification.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { pendingChannels: [] },
    });

    sentGroups++;
  }

  return sentGroups;
}

/** Уведомления для колокольчика — последние, без пагинации. */
export async function listNotifications(userId: string, limit = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventCode: true,
      title: true,
      body: true,
      linkUrl: true,
      isRead: true,
      createdAt: true,
    },
  });
}

/**
 * Полная история — отдельная страница (BR-22, та же пагинация «Показать
 * ещё», что и в остальных списках). Колокольчик держит только последние
 * 30 без возможности пролистать дальше — этого хватает на пару недель
 * активной работы, а дальше найти что-то старое было решительно нечем.
 */
export async function listNotificationHistory(
  userId: string,
  filters: { category?: EventCategory; take?: number } = {},
) {
  const codes = filters.category
    ? (Object.keys(EVENTS) as EventCode[]).filter(
        (code) => EVENTS[code].category === filters.category,
      )
    : undefined;

  const rows = await prisma.notification.findMany({
    where: { userId, ...(codes && { eventCode: { in: codes } }) },
    orderBy: { createdAt: "desc" },
    // На одну больше запрошенного — по ней узнаём, что дальше есть ещё
    take: filters.take ? filters.take + 1 : undefined,
    select: {
      id: true,
      eventCode: true,
      title: true,
      body: true,
      linkUrl: true,
      isRead: true,
      createdAt: true,
    },
  });

  const hasMore = Boolean(filters.take && rows.length > filters.take);
  return { items: hasMore ? rows.slice(0, filters.take) : rows, hasMore };
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationsRead(
  userId: string,
  ids?: string[],
): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false, ...(ids && { id: { in: ids } }) },
    data: { isRead: true, readAt: new Date() },
  });
}
