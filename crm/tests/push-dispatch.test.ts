/**
 * Пуш в рассылке уведомлений (lib/notifications/notify.ts).
 *
 * Пуш идёт на ВСЕ события (решение заказчика 04.10.2026: раньше только на
 * срочные, и без привязанного мессенджера человек получал одну почту). Текст нейтральный —
 * название события и путь в кабинет, — категории и галочки человека
 * уважаются, а сбой доставки не роняет действие.
 * Отличие одно: клиенту пуш приходит так же, как агентству, — его
 * включают на устройстве сами, навязать его нельзя.
 *
 * Служба уведомлений подменена (web-push); признак «ушло» — вызов
 * отправки и отметка sentPushAt.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { subscription: { endpoint: string }; payload: string; options: Record<string, unknown> };

const service = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (() => undefined) as (endpoint: string) => Error | undefined,
}));

vi.mock("web-push", () => {
  const sendNotification = (
    subscription: Call["subscription"],
    payload: string,
    options: Record<string, unknown>,
  ) => {
    service.calls.push({ subscription, payload, options });
    const failure = service.respond(subscription.endpoint);
    return failure ? Promise.reject(failure) : Promise.resolve({ statusCode: 201 });
  };
  return { default: { sendNotification }, sendNotification };
});

import { prismaRaw as db } from "@/lib/db/prisma";
import { EVENTS } from "@/lib/notifications/events";
import { flushCollapsed, notify, PUSH_BODY } from "@/lib/notifications/notify";
import { savePushSubscription } from "@/lib/notifications/push";
import { pushSubscriptionSchema } from "@/lib/validation/push";

import {
  browserSubscription,
  pushServiceError,
  TEST_ENDPOINT,
  vapidKeys,
} from "./push-fixtures";

const ORG = "org_fattakhov";
const RECRUITER = "usr_rec1";
const CLIENT_ADMIN = "usr_cl_admin";

const keys = vapidKeys();

/** Данные, которых в пуше быть не должно ни при каком событии. */
const PERSONAL = ["Иванов", "Иван Иванович", "ООО Ромашка", "180 000"];

let original: Map<string, unknown>;

async function cleanup() {
  // Вся организация, а не только наши получатели: сводка (flushCollapsed)
  // берёт отложенные уведомления всех, и чужие хвосты других тестов
  // попали бы в счёт — так же чистит tests/notifications.test.ts
  await db.notification.deleteMany({ where: { organizationId: ORG } });
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: TEST_ENDPOINT } } });
}

async function subscribe(userId: string, name: string) {
  const input = pushSubscriptionSchema.parse(browserSubscription(`${TEST_ENDPOINT}${name}`));
  return savePushSubscription(userId, input, null);
}

async function lastNotification(userId: string) {
  return db.notification.findFirstOrThrow({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

function payloads() {
  return service.calls.map((c) => JSON.parse(c.payload) as Record<string, string>);
}

beforeEach(async () => {
  service.calls.length = 0;
  service.respond = () => undefined;
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:privacy@fattakhovhr.ru");

  original ??= new Map(
    (
      await db.user.findMany({
        where: { id: { in: [RECRUITER, CLIENT_ADMIN] } },
        select: { id: true, notifyPrefs: true },
      })
    ).map((u) => [u.id, u.notifyPrefs]),
  );
  for (const [id, prefs] of original) {
    await db.user.update({ where: { id }, data: { notifyPrefs: prefs as never } });
  }
  await cleanup();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  for (const [id, prefs] of original) {
    await db.user.update({ where: { id }, data: { notifyPrefs: prefs as never } });
  }
  await db.$disconnect();
});

describe("что уходит пушем", () => {
  it("срочное агентству — нейтральный текст, путь в кабинет, без подробностей", async () => {
    await subscribe(RECRUITER, "rec-phone");

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Иванов Иван Иванович: ООО Ромашка предлагает 180 000",
      body: "Иван Иванович готов выйти в понедельник",
      linkUrl: { agency: "/a/applications/app_13", client: "/applications/app_13" },
      groupKey: "vac_push_1",
    });

    expect(payloads()).toEqual([
      {
        title: EVENTS.NEW_COMMENT.description,
        body: PUSH_BODY,
        // Путь под получателя — кабинет агентства, а не клиента
        url: "/a/applications/app_13",
        tag: "NEW_COMMENT:vac_push_1",
      },
    ]);
    for (const word of PERSONAL) {
      expect(service.calls[0].payload).not.toContain(word);
    }
    expect(service.calls[0].options.urgency).toBe("high");
    expect((await lastNotification(RECRUITER)).sentPushAt).not.toBeNull();
  });

  it("клиенту — так же, если он сам включил пуш на устройстве", async () => {
    await subscribe(CLIENT_ADMIN, "client-phone");

    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Новый кандидат: Иванов Иван",
      linkUrl: { agency: "/a/applications/app_13", client: "/applications/app_13" },
    });

    expect(payloads()).toHaveLength(1);
    expect(payloads()[0]).toMatchObject({
      title: EVENTS.CANDIDATE_PRESENTED.description,
      url: "/applications/app_13",
    });
    // Без ключа схлопывания у каждого уведомления свой ярлык
    const notification = await lastNotification(CLIENT_ADMIN);
    expect(payloads()[0].tag).toBe(notification.id);
    expect(notification.sentPushAt).not.toBeNull();
  });

  it("без подписанного устройства пуша нет — а письмо есть", async () => {
    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Комментарий",
    });

    expect(service.calls).toHaveLength(0);
    const notification = await lastNotification(RECRUITER);
    expect(notification.sentPushAt).toBeNull();
    expect(notification.sentEmailAt).not.toBeNull();
  });

  it("и то, что не срочно (нет ВК), уходит пушем — пуш на все события", async () => {
    await subscribe(CLIENT_ADMIN, "invoice");

    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "INVOICE_ISSUED",
      title: "Счёт №1",
    });

    expect(service.calls).toHaveLength(1);
    const body = JSON.parse(service.calls[0].payload) as { title: string; body: string };
    for (const secret of PERSONAL) expect(JSON.stringify(body)).not.toContain(secret);
    expect((await lastNotification(CLIENT_ADMIN)).sentPushAt).not.toBeNull();
  });

  it("выключенная категория уважается и для пуша", async () => {
    await subscribe(RECRUITER, "category");
    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { email: true, categories: { discussion: false } } },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Комментарий",
    });

    expect(service.calls).toHaveLength(0);
  });

  it("снятая галочка пуша останавливает его на всех устройствах, почта идёт", async () => {
    await subscribe(RECRUITER, "paused-1");
    await subscribe(RECRUITER, "paused-2");
    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { email: true, push: false } },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Комментарий",
    });

    expect(service.calls).toHaveLength(0);
    expect((await lastNotification(RECRUITER)).sentEmailAt).not.toBeNull();
  });

  it("без ключей VAPID на сервере пуша нет даже у подписанных", async () => {
    await subscribe(RECRUITER, "no-vapid");
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Комментарий",
    });

    expect(service.calls).toHaveLength(0);
  });
});

describe("сбой доставки", () => {
  it("410 — подписка удалена, действие не упало, отметки нет", async () => {
    const saved = await subscribe(RECRUITER, "gone");
    service.respond = () => pushServiceError(410);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" }),
    ).resolves.toBeUndefined();

    expect(await db.pushSubscription.findUnique({ where: { id: saved.id } })).toBeNull();
    const notification = await lastNotification(RECRUITER);
    expect(notification.sentPushAt).toBeNull();
    // Почта от сбоя пуша не зависит
    expect(notification.sentEmailAt).not.toBeNull();
  });

  it("другая ошибка — счётчик отказов, подписка остаётся", async () => {
    const saved = await subscribe(RECRUITER, "error");
    service.respond = () => pushServiceError(502);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    const row = await db.pushSubscription.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.failureCount).toBe(1);
    expect((await lastNotification(RECRUITER)).sentPushAt).toBeNull();
  });

  it("одно устройство отказало — другое получило, отметка стоит", async () => {
    await subscribe(RECRUITER, "ok-device");
    await subscribe(RECRUITER, "bad-device");
    service.respond = (endpoint) =>
      endpoint.endsWith("bad-device") ? pushServiceError(500) : undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    expect(service.calls).toHaveLength(2);
    expect((await lastNotification(RECRUITER)).sentPushAt).not.toBeNull();
  });
});

describe("схлопывание (BR-30) — для пуша так же, как для писем", () => {
  async function comment(n: number) {
    for (let i = 0; i < n; i++) {
      await notify({
        organizationId: ORG,
        userIds: [RECRUITER],
        event: "NEW_COMMENT",
        title: `Комментарий ${i + 1}`,
        groupKey: "vac_push_collapse",
        linkUrl: "/a/vacancies/vac_push_collapse",
      });
    }
  }

  it("первое сразу, остальные ждут сводки — и сводка встаёт на место первого", async () => {
    await subscribe(RECRUITER, "collapse");

    await comment(4);
    expect(service.calls).toHaveLength(1);

    const held = await db.notification.findMany({
      where: { userId: RECRUITER, sentPushAt: null },
    });
    expect(held).toHaveLength(3);
    expect(held.every((n) => n.pendingChannels.includes("push"))).toBe(true);

    // Окно схлопывания закрылось
    await db.notification.updateMany({
      where: { userId: RECRUITER },
      data: { createdAt: new Date(Date.now() - 5 * 60_000) },
    });
    expect(await flushCollapsed()).toBe(1);

    expect(payloads()).toHaveLength(2);
    const [first, summary] = payloads();
    expect(summary.title).toBe(`${EVENTS.NEW_COMMENT.description}: 3`);
    // Тот же ярлык: на устройстве сводка заменяет первое уведомление
    expect(summary.tag).toBe(first.tag);
    expect(summary.url).toBe("/a/vacancies/vac_push_collapse");
  });

  it("пуш тоже считается «уже отправленным» — даже если почта выключена", async () => {
    await subscribe(RECRUITER, "push-only");
    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { email: false } },
    });

    await comment(3);

    // Без отметки пуша второе и третье ушли бы сразу, по одному
    expect(service.calls).toHaveLength(1);
  });
});

describe("журнал: что случилось с каждым пушем", () => {
  /** Строки журнала про пуш и про получателей, как их увидит тот, кто читает лог сервера. */
  function logged(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.map((call) => String(call[0])).filter((l: string) => /^\[(пуш|уведомления)\]/.test(l));
  }

  const NAME = EVENTS.NEW_COMMENT.description;

  it("успех записан: сколько устройств, принято, погасло, не дошло — без персональных данных", async () => {
    await subscribe(RECRUITER, "log-a");
    await subscribe(RECRUITER, "log-b");
    service.respond = (endpoint) => (endpoint.endsWith("log-b") ? pushServiceError(410) : undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "NEW_COMMENT",
      title: "Иванов Иван Иванович: ООО Ромашка предлагает 180 000",
      body: "Иван Иванович готов выйти в понедельник",
    });

    expect(logged(info)).toContain(
      `[пуш] ${RECRUITER}: «${NAME}» — устройств 2, принято службой 1, подписка погасла 1, не дошло 0`,
    );
    for (const line of logged(info)) {
      for (const word of PERSONAL) expect(line).not.toContain(word);
      expect(line).not.toContain(TEST_ENDPOINT);
    }
  });

  it("провал записан вместе со службой, кодом и временем ожидания — без адреса подписки", async () => {
    await subscribe(RECRUITER, "log-fail");
    service.respond = () => Object.assign(new Error("Socket timeout"), { code: "ETIMEDOUT" });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    const line = error.mock.calls.map((c) => String(c[0])).find((l) => l.includes("не доставлено"));
    expect(line).toMatch(/fcm\.googleapis\.com\): ETIMEDOUT Socket timeout, ждали \d+ мс$/);
    expect(line).not.toContain(TEST_ENDPOINT);
  });

  it("нет устройств — в журнале причина, а не тишина", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    expect(logged(info)).toEqual([
      `[пуш] ${RECRUITER}: «${NAME}» — не отправлялось: нет подписанных устройств`,
    ]);
  });

  it("выключенная категория и снятая галочка названы по имени", async () => {
    await subscribe(RECRUITER, "log-reasons");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { categories: { discussion: false } } },
    });
    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    await db.user.update({ where: { id: RECRUITER }, data: { notifyPrefs: { push: false } } });
    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    const lines = logged(info);
    expect(lines[0]).toContain("выключена категория «Обсуждения»");
    expect(lines[1]).toContain("снята галочка «Уведомления на телефон и компьютер»");
  });

  it("канал не настроен на сервере — это тоже в журнале", async () => {
    await subscribe(RECRUITER, "log-vapid");
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [RECRUITER], event: "NEW_COMMENT", title: "т" });

    expect(logged(info)[0]).toContain("канал на сервере не настроен");
  });

  it("схлопнутое окном уведомление — «уйдёт сводкой», не «потерялось»", async () => {
    await subscribe(RECRUITER, "log-collapse");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const send = () =>
      notify({
        organizationId: ORG,
        userIds: [RECRUITER],
        event: "NEW_COMMENT",
        title: "т",
        groupKey: "vac_push_log",
      });

    await send();
    await send();

    const lines = logged(info);
    expect(lines[0]).toContain("устройств 1, принято службой 1");
    expect(lines[1]).toContain("уйдёт сводкой");
  });

  it("событие без получателей и отключённый получатель — тоже названы", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await notify({ organizationId: ORG, userIds: [], event: "NEW_COMMENT", title: "т" });
    await notify({ organizationId: ORG, userIds: ["usr_net_takogo"], event: "NEW_COMMENT", title: "т" });

    const lines = logged(info);
    expect(lines[0]).toBe(`[уведомления] «${NAME}» — получателей нет, никому не отправлено`);
    expect(lines[1]).toContain("получатель usr_net_takogo не найден или отключён");
  });
});
