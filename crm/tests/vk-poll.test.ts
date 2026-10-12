/**
 * Опрос сообщений сообщества: бот отвечает без настроек Callback API.
 *
 * Вебхук работает, только если в сообществе включены нужные события и
 * сервер подтверждён, а токен сообщества этим управлять не может (методы
 * Callback и Long Poll отдают код 15). Опрос читает непрочитанные диалоги —
 * на это прав хватает — и разбирает сообщения тем же обработчиком.
 *
 * ВК подменён: fetch отвечает по имени метода и собирает отправленное.
 * Пишет в тестовую базу; всё созданное убирается.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { handleVkMessage } from "@/lib/notifications/vk-inbox";
import { issueVkLinkCode } from "@/lib/notifications/vk-link";
import { pollVkInboxOnce, startVkInboxPoller } from "@/lib/notifications/vk-poll";

const MARK = "test-vk-poll";
const ORG = "org_fattakhov";
const TOKEN = "test-vk-token";

let seq = 0;
const nextPeer = () => 930_000_000 + ++seq;

type Msg = { id: number; cmid: number; from: number; out?: 0 | 1; text: string; payload?: string; age?: number };
type Dialog = { peerId: number; read?: boolean; type?: string; history: Msg[] };

const NOW_S = () => Math.floor(Date.now() / 1000);

/** Подмена VK API: getConversations → getHistory → markAsRead → messages.send. */
function stubVk(dialogs: Dialog[], options: { failWith?: { code: number; msg: string } } = {}) {
  const sent: { userId: string; message: string }[] = [];
  const marked: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: URLSearchParams }) => {
      const method = String(url).split("/method/")[1];
      const body = init.body;
      const ok = (response: unknown) => ({ status: 200, json: async () => ({ response }) });
      if (options.failWith) {
        return { status: 200, json: async () => ({ error: { error_code: options.failWith!.code, error_msg: options.failWith!.msg } }) };
      }
      if (method === "messages.getConversations") {
        return ok({
          count: dialogs.length,
          items: dialogs.map((d) => {
            const last = [...d.history].sort((x, y) => y.cmid - x.cmid)[0];
            return {
              conversation: {
                peer: { id: d.peerId, type: d.type ?? "user" },
                // «прочитано» администратором: бот обязан отвечать всё равно
                unread_count: d.read ? 0 : 1,
                in_read_cmid: d.read ? last.cmid : 0,
              },
              last_message: {
                id: last.id,
                conversation_message_id: last.cmid,
                date: NOW_S() - (last.age ?? 0),
                from_id: last.out ? -241640513 : last.from,
                out: last.out ?? 0,
                text: last.text,
              },
            };
          }),
        });
      }
      if (method === "messages.getHistory") {
        const peer = Number(body.get("peer_id"));
        const d = dialogs.find((x) => x.peerId === peer);
        const items = [...(d?.history ?? [])]
          .sort((a, b) => b.cmid - a.cmid)
          .map((m) => ({
            id: m.id,
            conversation_message_id: m.cmid,
            date: NOW_S() - (m.age ?? 0),
            from_id: m.out ? -241640513 : m.from,
            peer_id: peer,
            out: m.out ?? 0,
            text: m.text,
            ...(m.payload ? { payload: m.payload } : {}),
          }));
        return ok({ count: items.length, items });
      }
      if (method === "messages.markAsRead") {
        marked.push(Number(body.get("peer_id")));
        return ok(1);
      }
      if (method === "messages.send") {
        sent.push({ userId: body.get("user_id") ?? "", message: body.get("message") ?? "" });
        return ok(1);
      }
      return { status: 404, json: async () => ({}) };
    }),
  );
  return { sent, marked };
}

async function makeUser(suffix: string, fullName = "Тест Опрос") {
  return db.user.create({
    data: {
      organizationId: ORG,
      email: `${MARK}-${suffix}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName,
      role: "RECRUITER",
    },
    select: { id: true },
  });
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.vkLinkCode.deleteMany({ where: { userId: { in: ids } } });
  await db.authFailure.deleteMany({ where: { key: { startsWith: "vk-link:93" } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.vkMessageSeen.deleteMany({ where: { peerId: { startsWith: "93" } } });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "p".repeat(40));
  vi.stubEnv("VK_BOT_TOKEN", TOKEN);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await cleanup();
});

afterAll(cleanup);

describe("опрос диалогов сообщества", () => {
  it("код из сообщения привязывает страницу, бот отвечает «Готово» с именем, диалог помечается прочитанным", async () => {
    const user = await makeUser("code", "Анна Петрова");
    const { code } = await issueVkLinkCode(user.id);
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, history: [{ id: 1, cmid: 1, from: peer, text: code }] }]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 1, conversations: 1 });
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBe(String(peer));
    expect(vk.sent).toHaveLength(1);
    expect(vk.sent[0].message).toContain("Готово");
    expect(vk.sent[0].message).toContain("«Анна Петрова»");
    expect(vk.marked).toEqual([peer]);
  });

  it("сообщение, которое администратор уже прочитал во входящих сообщества, всё равно получает ответ", async () => {
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, read: true, history: [{ id: 1, cmid: 3, from: peer, text: "Начать" }] }]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 1, conversations: 1 });
    expect(vk.sent[0].message).toContain("Здравствуйте");
  });

  it("на «Начать» отвечает приветствием", async () => {
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, history: [{ id: 1, cmid: 1, from: peer, text: "Начать" }] }]);

    await pollVkInboxOnce(TOKEN);

    expect(vk.sent[0].message).toContain("Здравствуйте");
    expect(vk.sent[0].message).toContain("Получить код привязки");
  });

  it("пачка сообщений разбирается по порядку: сначала «Начать», потом код", async () => {
    const user = await makeUser("burst");
    const { code } = await issueVkLinkCode(user.id);
    const peer = nextPeer();
    const vk = stubVk([
      {
        peerId: peer,
        history: [
          { id: 1, cmid: 1, from: peer, text: "Начать" },
          { id: 2, cmid: 2, from: peer, text: code },
        ],
      },
    ]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 2, conversations: 1 });
    expect(vk.sent.map((m) => m.message.slice(0, 12))).toEqual(["Здравствуйте", "Готово! Акка"]);
  });

  it("повторный проход по тому же сообщению не отвечает второй раз", async () => {
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, history: [{ id: 1, cmid: 7, from: peer, text: "привет" }] }]);

    await pollVkInboxOnce(TOKEN);
    const again = await pollVkInboxOnce(TOKEN);

    expect(again).toEqual({ handled: 0, conversations: 0 });
    expect(vk.sent).toHaveLength(1);
  });

  it("вебхук и опрос на одном сообщении — ответ один", async () => {
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, history: [{ id: 1, cmid: 12, from: peer, text: "Начать" }] }]);

    const viaWebhook = await handleVkMessage({ type: "message_new", fromId: peer, text: "Начать", cmid: 12 });
    const viaPoll = await pollVkInboxOnce(TOKEN);

    expect(viaWebhook).toBe(true);
    expect(viaPoll).toEqual({ handled: 0, conversations: 0 });
    expect(vk.sent).toHaveLength(1);
  });

  it("не отвечает, когда последним написало сообщество, и не лезет в беседы", async () => {
    const peer = nextPeer();
    const chat = nextPeer();
    const vk = stubVk([
      {
        peerId: peer,
        history: [
          { id: 1, cmid: 4, from: peer, text: "вопрос" },
          { id: 2, cmid: 5, from: peer, out: 1, text: "ответ сообщества" },
        ],
      },
      { peerId: chat, type: "chat", history: [{ id: 1, cmid: 1, from: chat, text: "в беседе" }] },
    ]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 0, conversations: 0 });
    expect(vk.sent).toHaveLength(0);
  });

  it("не отвечает на сообщения старше суток", async () => {
    const peer = nextPeer();
    const vk = stubVk([{ peerId: peer, history: [{ id: 1, cmid: 1, from: peer, text: "Начать", age: 25 * 3600 }] }]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 0, conversations: 0 });
    expect(vk.sent).toHaveLength(0);
  });

  it("залп из десяти сообщений не превращается в десять ответов — не больше пяти за проход", async () => {
    const peer = nextPeer();
    const history: Msg[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, cmid: i + 1, from: peer, text: "привет" }));
    const vk = stubVk([{ peerId: peer, history }]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 5, conversations: 1 });
    expect(vk.sent).toHaveLength(5);
  });

  it("отказ ВК возвращается ошибкой с кодом, ничего не бросает", async () => {
    stubVk([], { failWith: { code: 5, msg: "User authorization failed" } });

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ error: { code: 5, message: "User authorization failed" } });
  });

  it("«привет» много раз подряд не закрывает привязку: это не попытки угадать код", async () => {
    const peer = nextPeer();
    const history: Msg[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, cmid: i + 1, from: peer, text: "привет" }));
    const vk = stubVk([{ peerId: peer, history }]);

    const result = await pollVkInboxOnce(TOKEN);

    expect(result).toEqual({ handled: 5, conversations: 1 });
    expect(vk.sent).toHaveLength(5);
  });
});

describe("запуск опроса", () => {
  it("без ключа сообщества тихо ничего не запускает", () => {
    vi.stubEnv("VK_BOT_TOKEN", "");
    const timers = vi.spyOn(globalThis, "setTimeout");

    expect(() => startVkInboxPoller()).not.toThrow();
    expect(timers).not.toHaveBeenCalled();
    timers.mockRestore();
  });
});
