/**
 * Пуш-уведомления: подписки и доставка (lib/notifications/push.ts).
 *
 * Служба уведомлений подменена (web-push): проверяется не сеть, а то,
 * что мы ей отдаём, и что делаем с её ответом. Три вещи важнее прочих.
 * Адрес подписки задаёт браузер, а запрос по нему шлёт наш сервер —
 * во внутреннюю сеть он ходить не должен. Подписка переезжает к тому,
 * кто подписался последним: устройство одно, люди меняются. И отмершие
 * подписки убираются, а временный сбой службы не отписывает всех разом.
 */
import { createHash } from "node:crypto";
import { Agent } from "node:https";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  payload: string;
  options: Record<string, unknown>;
};

const service = vi.hoisted(() => ({
  calls: [] as Call[],
  /** Ответ службы по адресу подписки: ошибка — отказ, undefined — принято. */
  respond: (() => undefined) as (endpoint: string) => Error | undefined,
  /** Бросить прямо из вызова, а не отказом промиса. */
  throwSync: false,
}));

vi.mock("web-push", () => {
  const sendNotification = (
    subscription: Call["subscription"],
    payload: string,
    options: Record<string, unknown>,
  ) => {
    service.calls.push({ subscription, payload, options });
    if (service.throwSync) throw new Error("сломалось до запроса");
    const failure = service.respond(subscription.endpoint);
    return failure
      ? Promise.reject(failure)
      : Promise.resolve({ statusCode: 201, body: "", headers: {} });
  };
  return { default: { sendNotification }, sendNotification };
});

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  deleteOtherPushSubscriptions,
  deletePushSubscription,
  deviceLabel,
  endpointHash,
  guardedLookup,
  isPublicAddress,
  listPushDevices,
  MAX_DEVICES_PER_USER,
  savePushSubscription,
  sendPushToUser,
} from "@/lib/notifications/push";
import { pushConfig, pushPublicKey, vapidProblem } from "@/lib/notifications/push-config";
import {
  isAcceptablePushEndpoint,
  pushSubscriptionSchema,
} from "@/lib/validation/push";

import {
  browserSubscription,
  pushServiceError,
  TEST_ENDPOINT,
  vapidKeys,
} from "./push-fixtures";

const RECRUITER = "usr_rec1";
const CLIENT_ADMIN = "usr_cl_admin";

const keys = vapidKeys();

function configurePush() {
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:privacy@fattakhovhr.ru");
}

async function cleanup() {
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: TEST_ENDPOINT } } });
}

/** Подписка за человеком — так, как её сохранило бы действие подписки. */
async function subscribe(userId: string, name: string) {
  const input = pushSubscriptionSchema.parse(browserSubscription(`${TEST_ENDPOINT}${name}`));
  return savePushSubscription(userId, input, "Mozilla/5.0 (тест)");
}

beforeEach(async () => {
  service.calls.length = 0;
  service.respond = () => undefined;
  service.throwSync = false;
  await cleanup();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("адрес подписки — только служба уведомлений, не внутренняя сеть", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91bH",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
  ])("принимает %s", (endpoint) => {
    expect(isAcceptablePushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["http вместо https", "http://fcm.googleapis.com/fcm/send/abc"],
    ["адрес-число", "https://10.0.0.5/push"],
    ["число, записанное иначе", "https://2130706433/push"],
    ["IPv6", "https://[::1]/push"],
    ["localhost", "https://localhost/push"],
    ["имя без точки", "https://metadata/push"],
    ["внутреннее имя", "https://db.internal/push"],
    ["нестандартный порт", "https://fcm.googleapis.com:8443/fcm/send/abc"],
    ["логин в адресе", "https://user:pass@fcm.googleapis.com/fcm/send/abc"],
    ["не адрес", "просто текст"],
  ])("отказывает: %s", (_why, endpoint) => {
    expect(isAcceptablePushEndpoint(endpoint)).toBe(false);
  });
});

describe("подписка из браузера", () => {
  it("принимается, выравнивание «=» у ключей снимается", () => {
    const raw = browserSubscription(`${TEST_ENDPOINT}keys`);
    const padded = { ...raw, keys: { p256dh: `${raw.keys.p256dh}=`, auth: `${raw.keys.auth}==` } };
    const parsed = pushSubscriptionSchema.parse(padded);
    expect(parsed.keys).toEqual(raw.keys);
  });

  it("лишнее из браузера не принимается: чья подписка, решает сервер", () => {
    const parsed = pushSubscriptionSchema.parse({
      ...browserSubscription(`${TEST_ENDPOINT}extra`),
      userId: "usr_owner",
    });
    expect(parsed).not.toHaveProperty("userId");
  });

  it.each([
    ["короткий ключ", { p256dh: "BAAA", auth: "AAAAAAAAAAAAAAAAAAAAAA" }],
    ["ключ не P-256", { p256dh: "A".repeat(87), auth: "AAAAAAAAAAAAAAAAAAAAAA" }],
    ["короткий секрет", { auth: "AAAA" }],
    ["не base64url", { auth: "секрет!!секрет!!секрет" }],
  ])("отказывает: %s", (_why, override) => {
    const raw = browserSubscription(`${TEST_ENDPOINT}bad`);
    const result = pushSubscriptionSchema.safeParse({ ...raw, keys: { ...raw.keys, ...override } });
    expect(result.success).toBe(false);
  });
});

describe("настройка VAPID", () => {
  it("ничего не задано — канала нет, и жаловаться не на что", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    expect(pushConfig()).toBeNull();
    // Нет ключа для браузера — страницы настроек не показывают блок пуша,
    // макеты кабинетов не регистрируют воркер
    expect(pushPublicKey()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("все три — канал есть, открытый ключ уходит в браузер", () => {
    configurePush();
    expect(pushPublicKey()).toBe(keys.publicKey);
    expect(pushConfig()).toEqual({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:privacy@fattakhovhr.ru",
    });
  });

  it("наполовину заданная настройка выключает канал и говорит почему", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "");
    expect(pushConfig()).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).toContain("VAPID_SUBJECT");
  });

  it("ключи из разных пар — частая ошибка копирования", () => {
    const other = vapidKeys();
    expect(
      vapidProblem({
        publicKey: keys.publicKey,
        privateKey: other.privateKey,
        subject: "mailto:a@b.ru",
      }),
    ).toContain("разных пар");
  });

  it.each([
    ["контакт без схемы", { subject: "privacy@fattakhovhr.ru" }],
    ["ключ с «=»", { publicKey: `${keys.publicKey}=` }],
    ["не ключ", { privateKey: "секрет" }],
  ])("отказывает: %s", (_why, override) => {
    expect(
      vapidProblem({ ...keys, subject: "mailto:a@b.ru", ...override }),
    ).not.toBeNull();
  });
});

describe("соединение не ведёт во внутреннюю сеть", () => {
  it.each([
    ["8.8.8.8", true],
    ["142.250.74.106", true],
    ["2a00:1450:4010:c05::5f", true],
    // Адреса VPN в режиме fake-ip: на сервере их нет, у разработчика — все имена
    ["198.18.0.7", true],
    ["240.0.0.238", true],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fd00::1", false],
    ["fe80::1", false],
    ["::ffff:10.0.0.1", false],
    ["не адрес", false],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it("имя, которое разрешается во внутреннюю сеть, не соединяется", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      guardedLookup("localhost", { all: true }, (err) => resolve(err)),
    );
    expect(error?.code).toBe("EPUSHPRIVATE");
  });
});

describe("подписки", () => {
  it("сохраняется за человеком, браузер — для узнавания устройства", async () => {
    const saved = await subscribe(RECRUITER, "save");
    const row = await db.pushSubscription.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.userId).toBe(RECRUITER);
    expect(row.userAgent).toBe("Mozilla/5.0 (тест)");
    expect(row.failureCount).toBe(0);
  });

  it("то же устройство у другого человека — подписка переезжает, а не двоится", async () => {
    const first = await subscribe(RECRUITER, "shared");
    await db.pushSubscription.update({ where: { id: first.id }, data: { failureCount: 3 } });

    const input = pushSubscriptionSchema.parse(browserSubscription(`${TEST_ENDPOINT}shared`));
    await savePushSubscription(CLIENT_ADMIN, input, null);

    const rows = await db.pushSubscription.findMany({
      where: { endpoint: `${TEST_ENDPOINT}shared` },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(CLIENT_ADMIN);
    // Браузер только что подтвердил подписку — прежние отказы не в счёт
    expect(rows[0].failureCount).toBe(0);
    expect(rows[0].p256dh).toBe(input.keys.p256dh);
  });

  it(`больше ${MAX_DEVICES_PER_USER} устройств — вытесняется самое старое`, async () => {
    for (let i = 0; i <= MAX_DEVICES_PER_USER; i++) {
      const saved = await subscribe(RECRUITER, `cap-${i}`);
      // Явный порядок: в одну миллисекунду createdAt могут совпасть
      await db.pushSubscription.update({
        where: { id: saved.id },
        data: { createdAt: new Date(Date.now() - (100 - i) * 60_000) },
      });
    }
    const left = await db.pushSubscription.findMany({
      where: { userId: RECRUITER, endpoint: { startsWith: `${TEST_ENDPOINT}cap-` } },
      select: { endpoint: true },
    });
    expect(left).toHaveLength(MAX_DEVICES_PER_USER);
    expect(left.map((r) => r.endpoint)).not.toContain(`${TEST_ENDPOINT}cap-0`);
    expect(left.map((r) => r.endpoint)).toContain(`${TEST_ENDPOINT}cap-${MAX_DEVICES_PER_USER}`);
  });

  it("отписать можно только своё", async () => {
    await subscribe(CLIENT_ADMIN, "foreign");
    expect(await deletePushSubscription(RECRUITER, `${TEST_ENDPOINT}foreign`)).toBe(0);
    expect(await deletePushSubscription(CLIENT_ADMIN, `${TEST_ENDPOINT}foreign`)).toBe(1);
  });

  it("«отключить на остальных» оставляет это устройство", async () => {
    await subscribe(RECRUITER, "this");
    await subscribe(RECRUITER, "old-phone");
    await subscribe(CLIENT_ADMIN, "not-mine");

    expect(await deleteOtherPushSubscriptions(RECRUITER, `${TEST_ENDPOINT}this`)).toBe(1);
    const left = await db.pushSubscription.findMany({
      where: { endpoint: { startsWith: TEST_ENDPOINT } },
      select: { endpoint: true },
    });
    expect(left.map((r) => r.endpoint).sort()).toEqual(
      [`${TEST_ENDPOINT}not-mine`, `${TEST_ENDPOINT}this`].sort(),
    );
  });

  it("страница получает отпечатки, а не адреса", async () => {
    const saved = await subscribe(RECRUITER, "fingerprint");
    const devices = await listPushDevices(RECRUITER);
    const device = devices.find((d) => d.id === saved.id);

    expect(device).toBeDefined();
    expect(JSON.stringify(devices)).not.toContain(TEST_ENDPOINT);
    // SHA-256 в base64url — тот же отпечаток считает браузер через Web Crypto
    // (push-client.ts; совпадение держит tests/components/push-device.test.tsx)
    expect(device?.endpointHash).toBe(
      createHash("sha256").update(saved.endpoint).digest("base64url"),
    );
    expect(device?.endpointHash).toBe(endpointHash(saved.endpoint));
  });
});

describe("доставка", () => {
  beforeEach(configurePush);

  it("на все устройства, с ключами VAPID, сроком жизни и таймаутом", async () => {
    await subscribe(RECRUITER, "phone");
    await subscribe(RECRUITER, "laptop");

    const delivery = await sendPushToUser(RECRUITER, {
      title: "Новый комментарий в обсуждении",
      body: "Подробности — в кабинете",
      url: "/a/applications/app_13",
      tag: "NEW_COMMENT:vac_1",
      urgency: "high",
    });

    expect(delivery.sent).toBe(2);
    expect(service.calls.map((c) => c.subscription.endpoint).sort()).toEqual(
      [`${TEST_ENDPOINT}laptop`, `${TEST_ENDPOINT}phone`].sort(),
    );
    const [call] = service.calls;
    expect(JSON.parse(call.payload)).toEqual({
      title: "Новый комментарий в обсуждении",
      body: "Подробности — в кабинете",
      url: "/a/applications/app_13",
      tag: "NEW_COMMENT:vac_1",
    });
    expect(call.options).toMatchObject({
      vapidDetails: {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        subject: "mailto:privacy@fattakhovhr.ru",
      },
      TTL: 24 * 60 * 60,
      timeout: 5_000,
      urgency: "high",
    });
    // Запросы идут через агент, который не пускает во внутреннюю сеть
    expect(call.options.agent).toBeInstanceOf(Agent);

    const rows = await db.pushSubscription.findMany({
      where: { userId: RECRUITER, endpoint: { startsWith: TEST_ENDPOINT } },
    });
    expect(rows.every((r) => r.lastSuccessAt !== null && r.failureCount === 0)).toBe(true);
  });

  it.each([404, 410])("ответ %i — подписки больше нет, строка удаляется", async (status) => {
    const saved = await subscribe(RECRUITER, `gone-${status}`);
    service.respond = () => pushServiceError(status);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const delivery = await sendPushToUser(RECRUITER, { title: "т" });

    expect(delivery).toMatchObject({ sent: 0, removed: 1, failed: 0 });
    expect(await db.pushSubscription.findUnique({ where: { id: saved.id } })).toBeNull();
  });

  it("другой отказ — счётчик растёт, подписка остаётся", async () => {
    const saved = await subscribe(RECRUITER, "flaky");
    service.respond = () => pushServiceError(500);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const delivery = await sendPushToUser(RECRUITER, { title: "т" });

    expect(delivery.outcomes).toEqual([{ state: "rejected", status: 500 }]);
    const row = await db.pushSubscription.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.failureCount).toBe(1);
  });

  it("сеть не ответила — тоже отказ, а не исключение", async () => {
    const saved = await subscribe(RECRUITER, "offline");
    service.respond = () => Object.assign(new Error("Socket timeout"), { code: "ECONNRESET" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const delivery = await sendPushToUser(RECRUITER, { title: "т" });

    expect(delivery.outcomes).toEqual([{ state: "unreachable" }]);
    expect(
      (await db.pushSubscription.findUniqueOrThrow({ where: { id: saved.id } })).failureCount,
    ).toBe(1);
  });

  it("пятый отказ подряд при недавней доставке — подписку не трогаем", async () => {
    const saved = await subscribe(RECRUITER, "outage");
    await db.pushSubscription.update({
      where: { id: saved.id },
      data: { failureCount: 4, lastSuccessAt: new Date(Date.now() - 60 * 60_000) },
    });
    service.respond = () => pushServiceError(503);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPushToUser(RECRUITER, { title: "т" });

    // Сбой у службы или в сети облака не должен отписать всех разом
    const row = await db.pushSubscription.findUnique({ where: { id: saved.id } });
    expect(row?.failureCount).toBe(5);
  });

  it("пятый отказ подряд и неделя без доставки — подписка удаляется", async () => {
    const saved = await subscribe(RECRUITER, "dead");
    await db.pushSubscription.update({
      where: { id: saved.id },
      data: { failureCount: 4, lastSuccessAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) },
    });
    service.respond = () => pushServiceError(403);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPushToUser(RECRUITER, { title: "т" });

    expect(await db.pushSubscription.findUnique({ where: { id: saved.id } })).toBeNull();
  });

  it("успех обнуляет счётчик отказов", async () => {
    const saved = await subscribe(RECRUITER, "recovered");
    await db.pushSubscription.update({ where: { id: saved.id }, data: { failureCount: 3 } });

    await sendPushToUser(RECRUITER, { title: "т" });

    const row = await db.pushSubscription.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.failureCount).toBe(0);
    expect(row.lastSuccessAt).not.toBeNull();
  });

  it("адрес, ведущий во внутреннюю сеть, удаляется сразу", async () => {
    const saved = await subscribe(RECRUITER, "rebinding");
    service.respond = () => Object.assign(new Error("внутренняя сеть"), { code: "EPUSHPRIVATE" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPushToUser(RECRUITER, { title: "т" });

    expect(await db.pushSubscription.findUnique({ where: { id: saved.id } })).toBeNull();
  });

  it("не бросает, даже если библиотека упала прямо в вызове", async () => {
    await subscribe(RECRUITER, "throws");
    service.throwSync = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendPushToUser(RECRUITER, { title: "т" })).resolves.toMatchObject({ sent: 0 });
  });

  it("без настройки на сервере не шлёт ничего", async () => {
    await subscribe(RECRUITER, "no-config");
    vi.unstubAllEnvs();
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    const delivery = await sendPushToUser(RECRUITER, { title: "т" });

    expect(delivery.sent).toBe(0);
    expect(service.calls).toHaveLength(0);
  });
});

describe("название устройства в проверке (по user-agent)", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", "Chrome · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0", "Edge · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 YaBrowser/24.10 Safari/537.36", "Яндекс Браузер · Windows"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1", "Safari · iPhone"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36", "Chrome · Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · Linux"],
    ["", "Устройство"],
    ["curl/8.0", "Устройство"],
  ])("%s → %s", (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it("нет user-agent вовсе — «Устройство»", () => {
    expect(deviceLabel(null)).toBe("Устройство");
    expect(deviceLabel(undefined)).toBe("Устройство");
  });
});
