/**
 * Включение и выключение пуша на устройстве (app/actions/push.ts)
 * и галочка пуша в форме настроек (saveNotifySettingsAction).
 *
 * Подписка всегда за тем, кто вошёл: браузер присылает только саму
 * подписку, а чья она — решает сессия. После подписки на устройство
 * уходит проверочное уведомление: по нему видно, что всё работает,
 * а отмершая подписка всплывает сразу, а не на первом событии.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { subscription: { endpoint: string }; payload: string };

const state = vi.hoisted(() => ({
  actor: {
    id: "usr_rec1",
    organizationId: "org_fattakhov",
    role: "RECRUITER",
    clientId: null,
    grants: [],
  } as Record<string, unknown>,
  rateAllowed: true,
  calls: [] as Call[],
  respond: (() => undefined) as (endpoint: string) => Error | undefined,
}));

vi.mock("@/lib/auth/session", () => ({ requireActor: async () => state.actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone) Mobile/15E148" }),
}));
vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: state.rateAllowed, retryAfter: 120 }),
  rateLimitMessage: () => "Слишком много попыток. Попробуйте через 2 минут.",
}));
vi.mock("web-push", () => {
  const sendNotification = (subscription: Call["subscription"], payload: string) => {
    state.calls.push({ subscription, payload });
    const failure = state.respond(subscription.endpoint);
    return failure ? Promise.reject(failure) : Promise.resolve({ statusCode: 201 });
  };
  return { default: { sendNotification }, sendNotification };
});

import { saveNotifySettingsAction } from "@/app/actions/notifications";
import {
  removeOtherPushDevicesAction,
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/actions/push";
import { prismaRaw as db } from "@/lib/db/prisma";

import {
  browserSubscription,
  pushServiceError,
  TEST_ENDPOINT,
  vapidKeys,
} from "./push-fixtures";

const RECRUITER = "usr_rec1";
const CLIENT_ADMIN = "usr_cl_admin";

const recruiter = { ...state.actor };
const clientAdmin = {
  id: CLIENT_ADMIN,
  organizationId: "org_fattakhov",
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
  grants: [],
};

const keys = vapidKeys();
let originalPrefs: unknown;

async function rows() {
  return db.pushSubscription.findMany({
    where: { endpoint: { startsWith: TEST_ENDPOINT } },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  originalPrefs = (
    await db.user.findUniqueOrThrow({ where: { id: RECRUITER }, select: { notifyPrefs: true } })
  ).notifyPrefs;
});

beforeEach(async () => {
  state.actor = recruiter;
  state.rateAllowed = true;
  state.calls.length = 0;
  state.respond = () => undefined;
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:privacy@fattakhovhr.ru");
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: TEST_ENDPOINT } } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: TEST_ENDPOINT } } });
  await db.user.update({
    where: { id: RECRUITER },
    data: { notifyPrefs: originalPrefs as never },
  });
  await db.$disconnect();
});

describe("включить на устройстве", () => {
  it("подписка — за вошедшим, проверочное уведомление — на это устройство", async () => {
    const subscription = browserSubscription(`${TEST_ENDPOINT}enable`);

    const result = await subscribePushAction({ ...subscription, userId: CLIENT_ADMIN });

    expect(result.ok).toContain("проверочное уведомление");
    const [row] = await rows();
    // userId из браузера проигнорирован: подписка того, чья сессия
    expect(row.userId).toBe(RECRUITER);
    expect(row.userAgent).toContain("iPhone");

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].subscription.endpoint).toBe(subscription.endpoint);
    const payload = JSON.parse(state.calls[0].payload);
    expect(payload).toMatchObject({ title: "Уведомления включены", url: "/a/settings" });
  });

  it("клиенту ссылка проверочного уведомления — в его кабинет", async () => {
    state.actor = clientAdmin;
    await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}client`));
    expect(JSON.parse(state.calls[0].payload).url).toBe("/settings");
  });

  it("устройство, где до этого был другой человек, переезжает к вошедшему", async () => {
    const subscription = browserSubscription(`${TEST_ENDPOINT}handed-over`);
    state.actor = clientAdmin;
    await subscribePushAction(subscription);

    state.actor = recruiter;
    await subscribePushAction(subscription);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].userId).toBe(RECRUITER);
  });

  it.each([
    ["http", "http://fcm.googleapis.com/fcm/send/x"],
    ["внутренний адрес", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/push"],
  ])("подписка с адресом «%s» не принимается и ничего не шлёт", async (_why, endpoint) => {
    const result = await subscribePushAction({
      ...browserSubscription(`${TEST_ENDPOINT}x`),
      endpoint,
    });
    expect(result.error).toBeTruthy();
    expect(await db.pushSubscription.count({ where: { endpoint } })).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it("без ключей VAPID на сервере — честный отказ", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    const result = await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}off`));

    expect(result.error).toContain("не подключены");
    expect(await rows()).toHaveLength(0);
  });

  it("частые подписки ограничены", async () => {
    state.rateAllowed = false;
    const result = await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}rate`));
    expect(result.error).toContain("Слишком много попыток");
    expect(await rows()).toHaveLength(0);
  });

  it("служба не узнала подписку — браузеру предлагается подписаться заново", async () => {
    state.respond = () => pushServiceError(410);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}stale`));

    expect(result.resubscribe).toBe(true);
    expect(result.error).toBeTruthy();
    // Отмершая подписка не остаётся в базе
    expect(await rows()).toHaveLength(0);
  });

  it("служба недоступна — подписка сохранена, человек предупреждён", async () => {
    state.respond = () => Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}slow`));

    expect(result.warning).toContain("не смог связаться");
    expect(result.warning).toContain("Google");
    expect(await rows()).toHaveLength(1);
  });
});

describe("выключить", () => {
  it("на этом устройстве — только свою подписку", async () => {
    state.actor = clientAdmin;
    await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}theirs`));
    state.actor = recruiter;
    await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}mine`));

    // Чужой адрес — ничего не происходит
    await unsubscribePushAction({ endpoint: `${TEST_ENDPOINT}theirs` });
    expect(await rows()).toHaveLength(2);

    const result = await unsubscribePushAction({ endpoint: `${TEST_ENDPOINT}mine` });
    expect(result.ok).toBeTruthy();
    expect((await rows()).map((r) => r.endpoint)).toEqual([`${TEST_ENDPOINT}theirs`]);
  });

  it("на остальных устройствах — это остаётся", async () => {
    await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}here`));
    await subscribePushAction(browserSubscription(`${TEST_ENDPOINT}lost-phone`));

    const result = await removeOtherPushDevicesAction({ keepEndpoint: `${TEST_ENDPOINT}here` });

    expect(result.ok).toContain("1 устройстве");
    expect((await rows()).map((r) => r.endpoint)).toEqual([`${TEST_ENDPOINT}here`]);
  });
});

describe("галочка пуша в форме настроек", () => {
  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  async function prefs() {
    const user = await db.user.findUniqueOrThrow({
      where: { id: RECRUITER },
      select: { notifyPrefs: true },
    });
    return user.notifyPrefs as Record<string, unknown>;
  }

  it("снятая галочка сохраняется как «выключено»", async () => {
    await saveNotifySettingsAction({}, form({ email: "on", pushInForm: "1" }));
    expect((await prefs()).push).toBe(false);
  });

  it("поставленная — как «включено»", async () => {
    await saveNotifySettingsAction({}, form({ email: "on", pushInForm: "1", push: "on" }));
    expect((await prefs()).push).toBe(true);
  });

  it("без блока пуша в форме прежнее значение не трогается", async () => {
    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { email: true, push: false } },
    });

    // Канал на сервере выключен — блока в форме нет, сохраняют остальное
    await saveNotifySettingsAction({}, form({ email: "on" }));

    expect((await prefs()).push).toBe(false);
  });
});

describe("«Отправить проверочное уведомление»", () => {
  async function subscribeAs(userAgent: string, endpoint: string) {
    // Подписка через действие: userAgent берётся из заголовков (подменён выше),
    // поэтому для разных устройств правим готовую строку
    await subscribePushAction(browserSubscription(endpoint));
    await db.pushSubscription.update({ where: { endpoint }, data: { userAgent } });
    state.calls.length = 0;
  }

  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
  const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1";

  it("шлёт настоящее уведомление на все устройства и отвечает по каждому", async () => {
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-a`);
    await subscribeAs(PHONE, `${TEST_ENDPOINT}test-b`);
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendTestPushAction();

    expect(result.error).toBeUndefined();
    expect(state.calls).toHaveLength(2);
    expect(JSON.parse(state.calls[0].payload)).toMatchObject({
      title: "Проверка уведомлений",
      url: "/a/settings",
      tag: "push-test",
    });
    expect(result.summary).toBe("Принято службой уведомлений: 2 из 2.");
    expect(result.devices?.map((d) => [d.label, d.state])).toEqual([
      ["Chrome · Windows", "sent"],
      ["Safari · iPhone", "sent"],
    ]);
    // Адресов подписок в ответе нет: он уходит в браузер
    expect(JSON.stringify(result)).not.toContain(TEST_ENDPOINT);
  });

  it("по каждому устройству свой исход: принято, подписка погасла и удалена, не дошло и почему", async () => {
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-ok`);
    await subscribeAs(PHONE, `${TEST_ENDPOINT}test-gone`);
    await subscribeAs("Mozilla/5.0 (Android 14) Chrome/130.0 Mobile Safari/537.36", `${TEST_ENDPOINT}test-403`);
    await subscribeAs("Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0", `${TEST_ENDPOINT}test-net`);
    state.respond = (endpoint) =>
      endpoint.endsWith("test-gone")
        ? pushServiceError(410)
        : endpoint.endsWith("test-403")
          ? pushServiceError(403)
          : endpoint.endsWith("test-net")
            ? Object.assign(new Error("Socket timeout"), { code: "ETIMEDOUT" })
            : undefined;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendTestPushAction();

    expect(result.summary).toBe("Принято службой уведомлений: 1 из 4.");
    const byLabel = Object.fromEntries((result.devices ?? []).map((d) => [d.label, d]));
    expect(byLabel["Chrome · Windows"].state).toBe("sent");
    expect(byLabel["Safari · iPhone"].state).toBe("gone");
    expect(byLabel["Safari · iPhone"].text).toContain("подписка погасла");
    expect(byLabel["Chrome · Android"].state).toBe("rejected");
    expect(byLabel["Chrome · Android"].text).toContain("код 403");
    expect(byLabel["Firefox · Linux"].state).toBe("unreachable");
    expect(byLabel["Firefox · Linux"].text).toContain("не смог связаться");

    // Погасшая подписка удалена, остальные на месте
    const left = (await rows()).map((r) => r.endpoint);
    expect(left).toHaveLength(3);
    expect(left).not.toContain(`${TEST_ENDPOINT}test-gone`);
  });

  it("пишет в журнал итог так же, как обычная рассылка", async () => {
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-log`);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendTestPushAction();

    expect(info).toHaveBeenCalledWith(
      `[пуш] ${RECRUITER}: «Проверка уведомлений» — устройств 1, принято службой 1, подписка погасла 0, не дошло 0`,
    );
  });

  it("устройств нет — понятный отказ, ничего не отправлено", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendTestPushAction();

    expect(result.error).toContain("не включены");
    expect(result.devices).toBeUndefined();
    expect(state.calls).toHaveLength(0);
  });

  it("чужие устройства не трогает — только вошедшего", async () => {
    state.actor = clientAdmin;
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-client`);
    state.actor = recruiter;
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendTestPushAction();

    expect(result.error).toBeTruthy();
    expect(state.calls).toHaveLength(0);
  });

  it("снятая галочка пуша не мешает проверке, но об этом сказано", async () => {
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-paused`);
    await db.user.update({
      where: { id: RECRUITER },
      data: { notifyPrefs: { push: false } },
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendTestPushAction();

    expect(result.summary).toBe("Принято службой уведомлений: 1 из 1.");
    expect(result.note).toContain("Галочка");
  });

  it("без ключей VAPID на сервере — честный отказ", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    const result = await sendTestPushAction();

    expect(result.error).toContain("не подключены");
  });

  it("частые нажатия ограничены", async () => {
    await subscribeAs(CHROME, `${TEST_ENDPOINT}test-rate`);
    state.rateAllowed = false;

    const result = await sendTestPushAction();

    expect(result.error).toContain("Слишком много попыток");
    expect(state.calls).toHaveLength(0);
  });
});
