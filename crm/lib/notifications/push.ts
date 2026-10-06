import { createHash } from "node:crypto";
import { lookup } from "node:dns";
import { Agent } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import type { PushSubscriptionInput } from "@/lib/validation/push";

import { pushConfig, type PushConfig } from "./push-config";

/**
 * Пуш-уведомления на устройства (Web Push: RFC 8030, 8291, 8292).
 *
 * Зачем. Быстрый сигнал на телефон, не требующий мессенджера: серверу
 * нужно достучаться только до службы уведомлений браузера (Google, Apple,
 * Mozilla), а содержимое шифруется ключами самого браузера: служба видит
 * только адрес и размер. Почта остаётся основным каналом — она получает
 * все поводы.
 *
 * Текст — тот же нейтральный, что в ВК: название события
 * и ссылка в кабинет, без имён, компаний и сумм. Шифрование здесь
 * не оправдание: уведомление показывается на экране блокировки,
 * и прочитать его может любой, кто взял телефон в руки.
 *
 * Здесь же — всё про строки PushSubscription: сохранение, переезд
 * к другому человеку, удаление отмерших (один сервис — одна сущность).
 */

/**
 * Сколько служба уведомлений держит сообщение, пока устройство
 * не в сети. По умолчанию у web-push — четыре недели, а «напоминание
 * за час до встречи», пришедшее через неделю, только сбивает с толку.
 * Сутки: дольше срочное перестаёт быть срочным, а письмо уже пришло.
 */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Сколько ждём ответа службы уведомлений. Рассылка идёт внутри действия
 * человека («отказать кандидату»), и зависшая служба не должна держать
 * его дольше нескольких секунд. Устройства опрашиваются параллельно.
 */
const TIMEOUT_MS = 5_000;

/**
 * Устройств на человека. Каждое уведомление уходит на все сразу, и без
 * потолка подписки копились бы годами — каждая новая подписка сверх него
 * вытесняет самую старую.
 */
export const MAX_DEVICES_PER_USER = 10;

/**
 * Когда отказывающую подписку пора удалить.
 *
 * Пять отказов подряд — и только если подписка молчит дольше недели.
 * Без второго условия сбой на стороне службы уведомлений или в сети
 * облака за пару часов отписал бы всех разом, и каждому пришлось бы
 * включать уведомления заново. 404 и 410 — другое дело: служба прямо
 * говорит, что подписки больше нет, и такие удаляются сразу.
 */
const FAILURES_BEFORE_REMOVAL = 5;
const SILENCE_BEFORE_REMOVAL_MS = 7 * 24 * 60 * 60_000;

// ---------------------------------------------------------------------
// Защита от запросов во внутреннюю сеть
// ---------------------------------------------------------------------

/*
  Адрес подписки задаёт браузер, то есть по сути человек — а запрос
  по нему отправляет наш сервер. Проверка при подписке
  (lib/validation/push.ts) отсекает адреса-числа и внутренние имена,
  но имя в интернете может вести куда угодно, в том числе во внутреннюю
  сеть облака. Поэтому адрес проверяется ещё раз при соединении, уже
  разрешённый: в закрытые диапазоны сервер не ходит.

  Диапазоны 198.18.0.0/15 и 240.0.0.0/4 здесь намеренно не закрыты:
  VPN-клиенты в режиме fake-ip отвечают на любое имя адресом оттуда,
  и у разработчика с таким VPN пуши не уходили бы вовсе. На сервере
  этих адресов нет ни у кого.
*/
const PRIVATE_RANGES = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // «этот» адрес
  ["10.0.0.0", 8], // внутренние сети (RFC 1918)
  ["100.64.0.0", 10], // общий адрес провайдера (CGNAT)
  ["127.0.0.0", 8], // сам сервер
  ["169.254.0.0", 16], // локальные, в том числе метаданные облака
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const) {
  // Адреса IPv4 внутри IPv6 (::ffff:10.0.0.1) BlockList сверяет с этими
  // же правилами сам
  PRIVATE_RANGES.addSubnet(net, prefix, "ipv4");
}
PRIVATE_RANGES.addAddress("::", "ipv6");
PRIVATE_RANGES.addAddress("::1", "ipv6");
PRIVATE_RANGES.addSubnet("fc00::", 7, "ipv6"); // внутренние сети IPv6
PRIVATE_RANGES.addSubnet("fe80::", 10, "ipv6"); // локальные IPv6

/** Можно ли серверу ходить на этот адрес. Не адрес вовсе — нельзя. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !PRIVATE_RANGES.check(address, family === 4 ? "ipv4" : "ipv6");
}

const PRIVATE_ADDRESS_CODE = "EPUSHPRIVATE";

/** Разрешение имени, которое не пускает во внутреннюю сеть. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, options, (error, address, family) => {
    if (error) return callback(error, address, family);
    const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (addresses.some((a) => !isPublicAddress(a))) {
      const refused: NodeJS.ErrnoException = new Error(
        `адрес службы уведомлений ведёт во внутреннюю сеть (${hostname})`,
      );
      refused.code = PRIVATE_ADDRESS_CODE;
      return callback(refused, address, family);
    }
    callback(null, address, family);
  });
};

/** Через него идут все запросы к службам уведомлений. */
const agent = new Agent({ lookup: guardedLookup });

// ---------------------------------------------------------------------
// Подписки
// ---------------------------------------------------------------------

/**
 * Отпечаток адреса подписки — по нему страница настроек узнаёт «это
 * устройство», не получая самих адресов: адрес подписки — то, по чему
 * шлют, и в разметке страницы ему делать нечего. Браузер считает тот же
 * SHA-256 (lib/notifications/push-client.ts).
 */
export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url");
}

/** Устройства человека для страницы настроек — без адресов и ключей. */
export async function listPushDevices(
  userId: string,
): Promise<{ id: string; endpointHash: string }[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, endpoint: true },
  });
  return rows.map((row) => ({ id: row.id, endpointHash: endpointHash(row.endpoint) }));
}

export type SavedPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Сохранить подписку за человеком.
 *
 * Адрес подписки уникален, и это главное правило: устройство одно,
 * а пользоваться им могут по очереди разные люди — телефон передали
 * коллеге, на общем компьютере вошёл другой. Подписка с тем же адресом
 * переезжает к тому, кто подписался последним: иначе уведомления
 * прежнего владельца продолжали бы приходить на чужой телефон.
 * Счётчик отказов обнуляется — браузер только что подтвердил подписку.
 */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<SavedPushSubscription> {
  const data = {
    userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 512) ?? null,
  };

  const saved = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { ...data, endpoint: input.endpoint },
    update: { ...data, failureCount: 0 },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  // Сверх потолка — вытесняем самые старые, кроме только что сохранённой
  const overflow = await prisma.pushSubscription.findMany({
    where: { userId, id: { not: saved.id } },
    orderBy: { createdAt: "desc" },
    skip: MAX_DEVICES_PER_USER - 1,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: overflow.map((row) => row.id) } },
    });
  }

  return saved;
}

/** Отписать устройство. Только своё: чужая подписка по адресу не находится. */
export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<number> {
  const { count } = await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
  return count;
}

/**
 * Отписать все устройства человека, кроме этого. Для потерянного
 * или отданного телефона: на нём самом «Отключить» уже не нажать.
 */
export async function deleteOtherPushSubscriptions(
  userId: string,
  keepEndpoint?: string,
): Promise<number> {
  const { count } = await prisma.pushSubscription.deleteMany({
    where: { userId, ...(keepEndpoint && { endpoint: { not: keepEndpoint } }) },
  });
  return count;
}

// ---------------------------------------------------------------------
// Отправка
// ---------------------------------------------------------------------

export type PushMessage = {
  title: string;
  body?: string;
  /**
   * Путь в кабинете, а не полный адрес: воркер (public/push-sw.js)
   * открывает его на том же адресе, где живёт сам, и чужие адреса
   * не открывает вовсе.
   */
  url?: string;
  /**
   * Уведомление с тем же ярлыком заменяет прежнее на экране, а не ложится
   * рядом: сводка (BR-30) встаёт на место первого сообщения о том же.
   */
  tag?: string;
  /** Подсказка телефону, будить ли его ради этого сразу. */
  urgency?: "high" | "normal" | "low";
};

/** Чем закончилась отправка на одно устройство. */
export type PushOutcome =
  | { state: "sent" }
  /** Подписки больше нет: служба ответила 404/410 или адрес ведёт внутрь сети. */
  | { state: "gone" }
  /** Служба ответила отказом — код ответа есть. */
  | { state: "rejected"; status: number }
  /** До службы не достучались: сеть, таймаут. */
  | { state: "unreachable" };

export type PushDelivery = {
  /** Скольким устройствам служба уведомлений сообщение приняла. */
  sent: number;
  /** Сколько отмерших подписок удалено по дороге. */
  removed: number;
  /** Сколько не дошло по иной причине — подписки остались. */
  failed: number;
  /** Исход по каждому устройству — для проверки каналов и подписки. */
  outcomes: PushOutcome[];
};

const NOTHING_SENT: PushDelivery = { sent: 0, removed: 0, failed: 0, outcomes: [] };

/** Исход по одному устройству — для проверочного уведомления в настройках. */
export type PushDeviceResult = {
  id: string;
  /** «Chrome · Windows» по user-agent подписки, без адреса. */
  label: string;
  /** Чья служба уведомлений: Google, Apple, Mozilla… */
  service: string;
  outcome: PushOutcome;
};

/**
 * Отправить на все устройства человека — параллельно — и вернуть исход
 * по каждому. Не бросает только на сбоях отправки: ошибка базы уйдёт
 * вызывающему (sendPushToUser ловит её сама).
 *
 * Строка в журнале на КАЖДУЮ рассылку, не только на сбои: раньше успех
 * нигде не записывался, и по журналу сервера нельзя было отличить «пуш не
 * отправлялся» от «отправлен, но до телефона не дошёл». Текст — тот же,
 * что у студенческой платформы, и без персональных данных: только id
 * пользователя и название события.
 */
export async function sendPushToUserDevices(
  userId: string,
  message: PushMessage,
): Promise<{ configured: boolean; devices: PushDeviceResult[] }> {
  const config = pushConfig();
  if (!config) {
    console.info(
      `[пуш] ${userId}: «${message.title}» — канал на сервере не настроен (VAPID_*), на устройства не отправлялось`,
    );
    return { configured: false, devices: [] };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, endpoint: true, p256dh: true, auth: true, userAgent: true },
  });
  if (subscriptions.length === 0) {
    // Видно в журнале, почему пуша нет: «никто не подписан», а не «сломалась отправка»
    console.info(
      `[пуш] ${userId}: нет подписанных устройств — «${message.title}» ушло только в колокольчик и на почту`,
    );
    return { configured: true, devices: [] };
  }

  const outcomes = await Promise.all(
    subscriptions.map((subscription) => sendPush(subscription, message, config)),
  );
  const delivery = summarize(outcomes);
  // «Принято службой» — устройство получит, если оно в сети и разрешения
  // в порядке; остальное объяснено строками «не доставлено» выше
  console.info(
    `[пуш] ${userId}: «${message.title}» — устройств ${subscriptions.length}, принято службой ${delivery.sent}, ` +
      `подписка погасла ${delivery.removed}, не дошло ${delivery.failed}`,
  );

  return {
    configured: true,
    devices: subscriptions.map((subscription, index) => ({
      id: subscription.id,
      label: deviceLabel(subscription.userAgent),
      service: pushServiceName(subscription.endpoint),
      outcome: outcomes[index],
    })),
  };
}

/**
 * Отправить человеку на все его устройства — параллельно.
 *
 * Не бросает никогда: как и остальные каналы, пуш не должен ронять
 * действие, которое его вызвало.
 */
export async function sendPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushDelivery> {
  try {
    const { devices } = await sendPushToUserDevices(userId, message);
    if (devices.length === 0) return NOTHING_SENT;
    return summarize(devices.map((device) => device.outcome));
  } catch (error) {
    console.error("[пуш] сбой рассылки", error);
    return NOTHING_SENT;
  }
}

/** Отправить на одно устройство — проверочное уведомление после подписки. */
export async function sendPushToSubscription(
  subscription: SavedPushSubscription,
  message: PushMessage,
): Promise<PushOutcome> {
  const config = pushConfig();
  if (!config) return { state: "unreachable" };
  return sendPush(subscription, message, config);
}

function summarize(outcomes: PushOutcome[]): PushDelivery {
  return {
    sent: outcomes.filter((o) => o.state === "sent").length,
    removed: outcomes.filter((o) => o.state === "gone").length,
    failed: outcomes.filter((o) => o.state === "rejected" || o.state === "unreachable").length,
    outcomes,
  };
}

/** Содержимое пуша для воркера (public/push-sw.js): строки, ничего лишнего. */
export function pushPayload(message: PushMessage): string {
  return JSON.stringify({
    title: message.title,
    body: message.body ?? "",
    url: message.url ?? "/",
    tag: message.tag,
  });
}

/**
 * Параметры запроса к службе уведомлений. Отдельной функцией, чтобы тест
 * мог прогнать их через настоящий web-push (tests/push-request.test.ts):
 * недопустимое значение там бросает исключение, а подмена службы
 * в остальных тестах его бы не заметила.
 */
export function pushRequestOptions(message: PushMessage, config: PushConfig) {
  return {
    vapidDetails: config,
    TTL: TTL_SECONDS,
    urgency: message.urgency ?? "normal",
    timeout: TIMEOUT_MS,
    agent,
  } as const;
}

async function sendPush(
  subscription: SavedPushSubscription,
  message: PushMessage,
  config: PushConfig,
): Promise<PushOutcome> {
  const payload = pushPayload(message);

  let outcome: PushOutcome;
  const started = Date.now();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      pushRequestOptions(message, config),
    );
    outcome = { state: "sent" };
  } catch (error) {
    outcome = classify(error);
    // В журнал — служба, код и сколько ждали, без адреса подписки: по нему
    // можно слать. Время нужно, чтобы отличить «служба не отвечает вовсе»
    // от «отвечает дольше таймаута»: у Google из ряда сетей ответ идёт
    // по полминуты, у Apple и Mozilla — за секунду
    console.error(
      `[пуш] не доставлено ${subscription.id} (${hostOf(subscription.endpoint)}): ${describe(error)}, ждали ${Date.now() - started} мс`,
    );
  }

  await recordOutcome(subscription.id, outcome);
  return outcome;
}

function classify(error: unknown): PushOutcome {
  const status = (error as { statusCode?: unknown })?.statusCode;
  if (typeof status === "number") {
    return status === 404 || status === 410
      ? { state: "gone" }
      : { state: "rejected", status };
  }
  // Имя ведёт во внутреннюю сеть — такая подписка не станет рабочей никогда
  if ((error as NodeJS.ErrnoException)?.code === PRIVATE_ADDRESS_CODE) {
    return { state: "gone" };
  }
  return { state: "unreachable" };
}

/** Отметить исход в подписке. Сбой отметки не роняет отправку. */
async function recordOutcome(id: string, outcome: PushOutcome): Promise<void> {
  try {
    if (outcome.state === "sent") {
      await prisma.pushSubscription.updateMany({
        where: { id },
        data: { lastSuccessAt: new Date(), failureCount: 0 },
      });
      return;
    }
    if (outcome.state === "gone") {
      await prisma.pushSubscription.deleteMany({ where: { id } });
      return;
    }

    const row = await prisma.pushSubscription.update({
      where: { id },
      data: { failureCount: { increment: 1 } },
      select: { failureCount: true, lastSuccessAt: true, createdAt: true },
    });
    const silentSince = row.lastSuccessAt ?? row.createdAt;
    if (
      row.failureCount >= FAILURES_BEFORE_REMOVAL &&
      Date.now() - silentSince.getTime() > SILENCE_BEFORE_REMOVAL_MS
    ) {
      await prisma.pushSubscription.deleteMany({ where: { id } });
    }
  } catch (error) {
    // Подписку могли удалить параллельно (отписка, вторая рассылка) —
    // отмечать уже нечего
    console.error(`[пуш] не удалось отметить исход для ${id}`, error);
  }
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "адрес не разобрать";
  }
}

function describe(error: unknown): string {
  const e = error as { statusCode?: number; code?: string; message?: string };
  if (typeof e?.statusCode === "number") return `ответ ${e.statusCode}`;
  return [e?.code, e?.message].filter(Boolean).join(" ") || String(error);
}

/** Имя службы уведомлений для человека: по ней понятно, чья беда. */
export function pushServiceName(endpoint: string): string {
  const host = hostOf(endpoint);
  if (host.endsWith("googleapis.com")) return "Google";
  if (host.endsWith("push.apple.com")) return "Apple";
  if (host.endsWith("mozilla.com")) return "Mozilla";
  if (host.endsWith("notify.windows.com")) return "Microsoft";
  return host;
}

/**
 * Название устройства для человека — по user-agent, который браузер
 * прислал при подписке: «Chrome · Windows». Нужно, чтобы в результате
 * проверки было видно, какой из телефонов и компьютеров молчит.
 * Не узнали — просто «Устройство».
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Устройство";

  const browser = /YaBrowser/i.test(ua)
    ? "Яндекс Браузер"
    : /EdgA?\/|Edg\//.test(ua)
      ? "Edge"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /SamsungBrowser/i.test(ua)
          ? "Samsung Internet"
          : /Firefox\/|FxiOS/.test(ua)
            ? "Firefox"
            : /Chrome\/|CriOS/.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : null;

  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "macOS"
            : /Linux|X11/.test(ua)
              ? "Linux"
              : null;

  return [browser, system].filter(Boolean).join(" · ") || "Устройство";
}
