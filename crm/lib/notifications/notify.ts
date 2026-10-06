import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { isDeliverableEmail } from "./deliverable";
import { resolveLink, type NotificationLink } from "./links";
import { getEmailTransport, getVkTransport } from "./channels";
import {
  CATEGORY_LABELS,
  channelsForSide,
  eventDefinition,
  plural,
  EVENTS,
  type Channel,
  type EventCategory,
  type EventCode,
  type EventPriority,
} from "./events";
import { appOrigin } from "@/lib/urls";
import { brandedEmail } from "./email-brand";
import { sendPushToUser, type PushMessage } from "./push";
import { pushConfigured } from "./push-config";

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
  vkUserId: string | null;
  notifyPrefs: unknown;
  /** null у сотрудников агентства, заполнен у пользователей клиента. */
  clientId: string | null;
  /** Определяет кабинет, а значит и адрес ссылки. */
  role: UserRole;
  /** Сколько устройств подписано на пуш: без подписки слать его некуда. */
  pushDevices: number;
};

/** Что о получателе нужно рассылке — одно на доставку и на сводку. */
const RECIPIENT_SELECT = {
  id: true,
  email: true,
  vkUserId: true,
  notifyPrefs: true,
  clientId: true,
  role: true,
  _count: { select: { pushSubscriptions: true } },
} as const;

function toUserPrefs({
  _count,
  ...user
}: Omit<UserPrefs, "pushDevices"> & {
  _count: { pushSubscriptions: number };
}): UserPrefs {
  return { ...user, pushDevices: _count.pushSubscriptions };
}

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

  // Пуш — на ВСЕ события: человек сам включил его на устройстве кнопкой
  // в настройках, а выключить может галочкой «Пуш» или категорией (решение
  // заказчика 04.10.2026: раньше пуш шёл только по срочным событиям
  // и «не приходил», когда приходила одна почта)
  const withPhone: Channel[] = [
    ...defaults,
    ...(defaults.includes("push") ? [] : (["push"] as Channel[])),
  ];

  // Клиенту мессенджер только по его собственной привязке; пуш — только
  // на подписанные устройства и только при настроенном канале на сервере
  const allowed = channelsForSide(
    withPhone,
    user.clientId === null,
    Boolean(user.vkUserId),
    user.pushDevices > 0 && pushConfigured(),
  );

  return allowed.filter((channel) => {
    if (prefs[channel] === false) return false;
    // Без привязки мессенджеру отправить некуда
    if (channel === "vk" && !user.vkUserId) return false;
    // У зарегистрированных по телефону вместо почты
    // заглушка, пока настоящую не подтвердят по ссылке из письма
    if (channel === "email" && !isDeliverableEmail(user.email)) return false;
    return true;
  });
}

/**
 * Почему пуш этому человеку не отправляется — словами, для журнала.
 * null — причин нет, пуш пойдёт. Порядок тот же, что в enabledChannels:
 * первая сработавшая причина и есть ответ на «почему молчит телефон».
 */
function pushSkipReason(user: UserPrefs, category: EventCategory): string | null {
  const prefs =
    typeof user.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};
  const categories =
    typeof prefs.categories === "object" && prefs.categories !== null
      ? (prefs.categories as Record<string, unknown>)
      : {};

  if (categories[category] === false) {
    return `в настройках выключена категория «${CATEGORY_LABELS[category]}»`;
  }
  if (prefs.push === false) {
    return "в настройках снята галочка «Уведомления на телефон и компьютер»";
  }
  if (!pushConfigured()) return "канал на сервере не настроен (VAPID_*)";
  if (user.pushDevices === 0) return "нет подписанных устройств";
  return null;
}

/**
 * Строка журнала про пуш, который по этому уведомлению НЕ ушёл сразу.
 * Строки про настоящую отправку пишет сам sendPushToUser (push.ts).
 * Без них молчание телефона неотличимо от «событие никому не адресовано»:
 * успех раньше не писался вовсе, а причины пропуска — тем более.
 */
function logPushNotSent(userId: string, event: EventCode, why: string): void {
  console.info(`[пуш] ${userId}: «${eventDefinition(event).description}» — не отправлялось: ${why}`);
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
  const definition = eventDefinition(params.event);

  if (recipients.length === 0) {
    // Событие случилось, но адресовано некому (автор исключён, на вакансии
    // нет команды): телефон молчит не из-за канала
    console.info(`[уведомления] «${definition.description}» — получателей нет, никому не отправлено`);
    return;
  }

  const users = (
    await prisma.user.findMany({
      where: { id: { in: recipients }, isActive: true },
      select: RECIPIENT_SELECT,
    })
  ).map(toUserPrefs);

  if (users.length < recipients.length) {
    const found = new Set(users.map((u) => u.id));
    for (const id of recipients.filter((r) => !found.has(r))) {
      console.info(`[уведомления] «${definition.description}» — получатель ${id} не найден или отключён`);
    }
  }

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
              { sentVkAt: { not: null } },
              { sentPushAt: { not: null } },
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

    if (recentlySent) {
      if (channels.includes("push")) {
        logPushNotSent(
          user.id,
          params.event,
          `по этому поводу в последние ${COLLAPSE_WINDOW_MINUTES} минут уже отправляли — уйдёт сводкой`,
        );
      }
      continue;
    }

    if (!channels.includes("push")) {
      const why = pushSkipReason(user, definition.category);
      if (why) logPushNotSent(user.id, params.event, why);
    }

    await sendToChannels(notification.id, user, channels, {
      title: params.title,
      body: params.body,
      linkUrl,
      event: params.event,
      tag: pushTag(params.event, params.groupKey, notification.id),
    });
  }
}

/**
 * Нейтральный текст для мессенджера и пушей.
 *
 * В ВК не уходит ничего о человеке: ни ФИО, ни телефона,
 * ни компании, ни зарплаты. Только название события и ссылка,
 * за которой требуется вход в платформу.
 *
 * В переписке с сообществом сообщение живёт дольше, чем нужно,
 * и видно с телефона, поэтому персональные данные кандидатов в мессенджер
 * не попадают (юридический пакет, раздел 19; угроза T17 модели угроз).
 * Письмо на российский SMTP - другое дело, там подробности допустимы.
 *
 * Пуш зашифрован до самого устройства (RFC 8291), но правило то же:
 * уведомление видно на экране блокировки любому, кто взял телефон.
 */
function neutralText(event: EventCode, count: number): string {
  const name = eventDefinition(event).description;
  return count > 1 ? `${name}: ${count}` : name;
}

/** Вторая строка пуша: что именно случилось, человек увидит после входа. */
export const PUSH_BODY = "Подробности — в кабинете";

/**
 * Ярлык уведомления на устройстве. Тот же повод по той же вакансии
 * заменяет прежнее уведомление, а не ложится стопкой: сводка (BR-30)
 * встаёт на место первого сообщения. Без ключа схлопывания — своё
 * у каждого уведомления.
 */
function pushTag(
  event: EventCode,
  groupKey: string | null | undefined,
  notificationId: string,
): string {
  return groupKey ? `${event}:${groupKey}` : notificationId;
}

const PUSH_URGENCY: Record<EventPriority, NonNullable<PushMessage["urgency"]>> = {
  high: "high",
  normal: "normal",
  low: "low",
};

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
    /** Ярлык пуша — см. pushTag. */
    tag: string;
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
      html: brandedEmail({
        title: content.title,
        preview: content.body ?? content.title,
        heading: content.title,
        paragraphs: content.body ? [content.body] : [],
        action: url ? { href: url, label: "Открыть в кабинете" } : undefined,
        note: "Какие уведомления приходят на почту, можно выбрать в кабинете, в разделе «Настройки».",
      }),
    });
    sent.sentEmailAt = new Date();
  }

  // Нейтральный текст: без имён и контактов
  if (channels.includes("vk") && user.vkUserId) {
    await getVkTransport().send({
      userId: user.vkUserId,
      text: neutralText(content.event, content.count ?? 1),
      url,
      urlLabel: "Открыть в платформе",
    });
    sent.sentVkAt = new Date();
  }

  // Тот же нейтральный текст — на все подписанные устройства сразу.
  // Путь, а не полный адрес: воркер открывает его там же, где живёт сам
  if (channels.includes("push")) {
    const delivery = await sendPushToUser(user.id, {
      title: neutralText(content.event, content.count ?? 1),
      body: PUSH_BODY,
      url: content.linkUrl ?? "/",
      tag: content.tag,
      urgency: PUSH_URGENCY[eventDefinition(content.event).priority],
    });
    // Только по факту приёма: не дошедший ни до одного устройства пуш
    // отправленным не считается (см. Notification.sentPushAt)
    if (delivery.sent > 0) sent.sentPushAt = new Date();
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

  const users = (
    await prisma.user.findMany({
      where: { id: { in: [...new Set(pending.map((p) => p.userId))] } },
      select: RECIPIENT_SELECT,
    })
  ).map(toUserPrefs);
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
      tag: pushTag(items[0].eventCode as EventCode, items[0].groupKey, items[0].id),
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
