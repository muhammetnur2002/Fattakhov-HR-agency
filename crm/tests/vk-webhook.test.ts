/**
 * Webhook сообщества ВКонтакте: что происходит с настоящим событием
 * от начала до конца — привязка, ответ человеку, запись в журнал.
 *
 * Ходит в тестовую базу; ВК подменён: fetch собирает то, что мы отправили
 * бы человеку, и может отвечать отказом, как отвечает ВК (код 200 + error).
 * Строки журнала ищем по времени начала теста, а не считаем все подряд:
 * соседние файлы тестов тоже дёргают этот адрес.
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/vk/route";
import { prismaRaw as db } from "@/lib/db/prisma";
import { vkMessageOf } from "@/lib/notifications/vk-api";
import { issueVkLinkCode } from "@/lib/notifications/vk-link";
import { listVkEvents, recordVkEvent, VK_EVENT_RETENTION_DAYS } from "@/lib/notifications/vk-events";

const MARK = "test-vk-webhook";
const ORG = "org_fattakhov";
const GROUP = 777001;
const SECRET = "vk-callback-secret-0123456789abcdef";

let startedAt: Date;
let seq = 0;
const nextVkId = () => 920_000_000 + ++seq;

type Sent = { userId: string; message: string };

/** Подмена ВК: запоминаем отправленное; failWith — ответить отказом. */
function stubVk(failWith?: { code: number; msg: string }) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      sent.push({ userId: init.body.get("user_id") ?? "", message: init.body.get("message") ?? "" });
      return {
        status: 200,
        json: async () =>
          failWith ? { error: { error_code: failWith.code, error_msg: failWith.msg } } : { response: 1 },
      };
    }),
  );
  return sent;
}

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/webhooks/vk", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

const message = (fromId: number, text: string, shape: "new" | "old" = "new", payload?: string) => ({
  type: "message_new",
  group_id: GROUP,
  secret: SECRET,
  object:
    shape === "new"
      ? { message: { from_id: fromId, text, ...(payload ? { payload } : {}) } }
      : { from_id: fromId, text, ...(payload ? { payload } : {}) },
});

async function makeUser(suffix: string) {
  return db.user.create({
    data: {
      organizationId: ORG,
      email: `${MARK}-${suffix}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName: "Тест Webhook",
      role: "RECRUITER",
    },
    select: { id: true },
  });
}

async function eventsSince() {
  return db.vkEvent.findMany({ where: { at: { gte: startedAt } }, orderBy: { at: "asc" } });
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.vkLinkCode.deleteMany({ where: { userId: { in: ids } } });
  await db.authFailure.deleteMany({ where: { key: { startsWith: "vk-link:92" } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.vkEvent.deleteMany({ where: { at: { gte: startedAt } } });
}

beforeEach(() => {
  startedAt = new Date();
  vi.stubEnv("AUTH_SECRET", "w".repeat(40));
  vi.stubEnv("VK_GROUP_ID", String(GROUP));
  vi.stubEnv("VK_CALLBACK_SECRET", SECRET);
  vi.stubEnv("VK_CALLBACK_CONFIRMATION", "abc12345");
  vi.stubEnv("VK_BOT_TOKEN", "test-vk-token");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await cleanup();
});

afterAll(cleanup);

describe("привязка кодом через webhook", () => {
  it("код из сообщения привязывает страницу, человеку уходит «Готово», в журнале — linked", async () => {
    const sent = stubVk();
    const user = await makeUser("link");
    const { code } = await issueVkLinkCode(user.id);
    const page = nextVkId();

    const res = await post(message(page, code));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBe(String(page));
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe(String(page));
    expect(sent[0].message).toContain("Готово");
    // Человек видит, к какому аккаунту и какой платформе привязался
    expect(sent[0].message).toContain("«Тест Webhook»");
    expect(sent[0].message).toContain("Fattakhov HR");
    expect((await eventsSince()).map((e) => e.outcome)).toContain("linked");
  });

  it("старый формат события (object — само сообщение) работает так же", async () => {
    const sent = stubVk();
    const user = await makeUser("old-format");
    const { code } = await issueVkLinkCode(user.id);

    await post(message(nextVkId(), code, "old"));

    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).not.toBeNull();
    expect(sent[0].message).toContain("Готово");
  });

  it("на «Начать» отвечает приветствием с инструкцией — человек понимает, что делать", async () => {
    const sent = stubVk();

    await post(message(nextVkId(), "Начать"));

    expect(sent).toHaveLength(1);
    expect(sent[0].message).toContain("Здравствуйте");
    expect(sent[0].message).toContain("Получить код привязки");
    expect(sent[0].message).toContain("шесть цифр");
    expect((await eventsSince()).map((e) => e.outcome)).toContain("greeting");
  });

  it("кнопка «Начать» из чата сообщества (payload) — тоже приветствие, что бы ни было в тексте", async () => {
    const sent = stubVk();

    await post(message(nextVkId(), "что-то", "new", '{"command":"start"}'));

    expect(sent[0].message).toContain("Здравствуйте");
  });

  it("на «привет» — то же приветствие", async () => {
    const sent = stubVk();

    await post(message(nextVkId(), "привет"));

    expect(sent[0].message).toContain("Здравствуйте");
  });

  it("на любой другой текст — короткое напоминание, не приветствие", async () => {
    const sent = stubVk();

    await post(message(nextVkId(), "как дела?"));

    expect(sent).toHaveLength(1);
    expect(sent[0].message).toContain("Не удалось разобрать сообщение");
    expect(sent[0].message).toContain("Начать");
    expect(sent[0].message).not.toContain("Здравствуйте");
    expect((await eventsSince()).map((e) => e.outcome)).toContain("not-a-code");
  });

  it("«привет» много раз подряд не блокирует привязку: это не попытки угадать код", async () => {
    stubVk();
    const user = await makeUser("chatty");
    const page = nextVkId();

    for (let i = 0; i < 8; i++) await post(message(page, "привет"));

    const { code } = await issueVkLinkCode(user.id);
    await post(message(page, code));
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBe(String(page));
  });

  it("неверный шестизначный код — подсказка и запись bad-code", async () => {
    const sent = stubVk();

    await post(message(nextVkId(), "000000"));

    expect(sent[0].message).toContain("Не нашли такой код");
    expect((await eventsSince()).map((e) => e.outcome)).toContain("bad-code");
  });
});

describe("журнал событий", () => {
  it("подтверждение адреса записывается и отдаёт строку", async () => {
    const res = await post({ type: "confirmation", group_id: GROUP });

    expect(await res.text()).toBe("abc12345");
    expect((await eventsSince()).map((e) => `${e.type}:${e.outcome}`)).toContain("confirmation:confirmed");
  });

  it("неверный секрет: 403 и запись forbidden-secret — видно, что ВК шлёт, но ключ не тот", async () => {
    const res = await post({ ...message(nextVkId(), "привет"), secret: "wrong" });

    expect(res.status).toBe(403);
    expect((await eventsSince()).map((e) => e.outcome)).toContain("forbidden-secret");
  });

  it("чужое сообщество: 403 и ни одной записи", async () => {
    const res = await post({ ...message(nextVkId(), "привет"), group_id: 1 });

    expect(res.status).toBe(403);
    expect(await eventsSince()).toHaveLength(0);
  });

  it("не наше событие (разрешил сообщения): «ok» и запись ignored, привязки нет", async () => {
    const sent = stubVk();

    const res = await post({ type: "message_allow", group_id: GROUP, secret: SECRET, object: { user_id: 5 } });

    expect(await res.text()).toBe("ok");
    expect(sent).toHaveLength(0);
    expect((await eventsSince()).map((e) => `${e.type}:${e.outcome}`)).toContain("message_allow:ignored");
  });

  it("не удалось ответить человеку: «ok» ВК всё равно, а в журнале — reply-failed с кодом ВК", async () => {
    stubVk({ code: 901, msg: "Can't send messages for users without permission" });

    const res = await post(message(nextVkId(), "привет"));

    expect(await res.text()).toBe("ok");
    const failed = (await eventsSince()).find((e) => e.outcome === "reply-failed");
    expect(failed?.vkErrorCode).toBe(901);
  });

  it("в журнале нет ни текста сообщения, ни страницы отправителя", async () => {
    stubVk();
    const page = nextVkId();
    await post(message(page, "секретный-текст-1234"));

    const rows = await eventsSince();
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("секретный-текст");
    expect(dump).not.toContain(String(page));
  });

  it("потолок записей: не больше 30 в минуту — адрес открыт, раздувать таблицу нельзя", async () => {
    // Внутри срока хранения: старше 30 дней строки удаляли бы записи соседних
    // тестов, и счёт плавал бы. Окно «за минуту» считается от этой даты, не от текущей
    const past = new Date(Date.now() - 10 * 86_400_000);
    const window = { gte: new Date(past.getTime() - 60_000), lte: new Date(past.getTime() + 60_000) };
    // Остатки прошлых запусков рядом по времени занимали бы потолок и портили счёт
    await db.vkEvent.deleteMany({ where: { at: window } });
    try {
      for (let i = 0; i < 40; i++) await recordVkEvent("message_new", "ignored", null, past);
      expect(await db.vkEvent.count({ where: { at: past } })).toBe(30);
    } finally {
      await db.vkEvent.deleteMany({ where: { at: window } });
    }
  });

  it("записи старше 30 дней удаляются при следующей записи", async () => {
    const old = new Date(Date.now() - (VK_EVENT_RETENTION_DAYS + 1) * 86_400_000);
    await db.vkEvent.create({ data: { type: "message_new", outcome: "ignored", at: old } });

    await recordVkEvent("message_new", "ignored");

    expect(await db.vkEvent.count({ where: { at: old } })).toBe(0);
  });

  it("список для владельца — свежие сверху, не больше запрошенного", async () => {
    await recordVkEvent("message_new", "linked", null, new Date(startedAt.getTime() + 1000));
    await recordVkEvent("confirmation", "confirmed", null, new Date(startedAt.getTime() + 2000));

    const rows = await listVkEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("confirmation");
  });
});

describe("vkMessageOf", () => {
  it("достаёт сообщение из обоих форматов и не падает на пустом", () => {
    expect(vkMessageOf({ message: { from_id: 1, text: "a" } })).toEqual({ from_id: 1, text: "a" });
    expect(vkMessageOf({ from_id: 2, text: "b" })).toEqual({ from_id: 2, text: "b" });
    expect(vkMessageOf({})).toBeUndefined();
    expect(vkMessageOf(undefined)).toBeUndefined();
  });
});
