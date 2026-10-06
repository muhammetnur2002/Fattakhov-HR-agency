import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/vk/route";
import {
  isStartMessage,
  parseLinkCode,
  secretsMatch,
  VK_GREETING,
  vkLinkCodeHash,
  vkLinkReply,
  type VkLinkOutcome,
} from "@/lib/notifications/vk-link";
import { NextRequest } from "next/server";

/**
 * Привязка ВКонтакте кодом: то, что можно проверить без базы.
 *
 * Сама выдача и погашение кода (consumeVkLinkCode) пишут в базу — их
 * проверяет интеграционная часть. Здесь — разбор сообщения, подпись,
 * сравнение секрета и договор с webhook: подтверждение адреса, отказ
 * без секрета и «ok» на принятое событие.
 */

const GROUP = "123456";
const SECRET = "vk-callback-secret-0123456789abcdef";
const CONFIRM = "a1b2c3d4";

function callback(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/vk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("разбор сообщения с кодом", () => {
  it("принимает шесть цифр с пробелами по краям", () => {
    expect(parseLinkCode(" 042917 ")).toBe("042917");
    expect(parseLinkCode("042917\n")).toBe("042917");
  });

  it("не принимает всё остальное — ни код с префиксом, ни короче, ни буквы", () => {
    expect(parseLinkCode("12345")).toBeNull();
    expect(parseLinkCode("1234567")).toBeNull();
    expect(parseLinkCode("FHR-123456")).toBeNull();
    expect(parseLinkCode("12 3456")).toBeNull();
    expect(parseLinkCode("привет")).toBeNull();
    expect(parseLinkCode("")).toBeNull();
  });
});

describe("подпись кода", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("детерминирована и не совпадает с самим кодом", () => {
    const a = vkLinkCodeHash("042917");
    expect(a).toBe(vkLinkCodeHash("042917"));
    expect(a).not.toContain("042917");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("разные коды — разные подписи", () => {
    expect(vkLinkCodeHash("042917")).not.toBe(vkLinkCodeHash("042918"));
  });
});

describe("сравнение секрета", () => {
  it("совпадает только при полном равенстве", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "abcd")).toBe(false);
    expect(secretsMatch("", "abc")).toBe(false);
  });
});

describe("ответы человеку", () => {
  it("на каждый исход есть текст — ни один не уйдёт пустым", () => {
    const outcomes: VkLinkOutcome[] = [
      { status: "linked", userId: "u1", fullName: "Иван Петров" },
      { status: "greeting" },
      { status: "not-a-code" },
      { status: "bad-code" },
      { status: "expired" },
      { status: "taken" },
      { status: "too-many-attempts" },
    ];
    for (const outcome of outcomes) {
      expect(vkLinkReply(outcome).length).toBeGreaterThan(10);
    }
  });

  it("«Готово» называет аккаунт и платформу — человек видит, к чему привязан", () => {
    const text = vkLinkReply({ status: "linked", userId: "u1", fullName: "Иван Петров" });
    expect(text).toContain("Готово");
    expect(text).toContain("«Иван Петров»");
    expect(text).toContain("Fattakhov HR");
    expect(text).toContain("Отвязать");
  });

  it("приветствие объясняет, что делать: кабинет, блок ВКонтакте, код, что ответит бот", () => {
    expect(VK_GREETING).toContain("Настройки");
    expect(VK_GREETING).toContain("Получить код привязки");
    expect(VK_GREETING).toContain("шесть цифр");
    expect(VK_GREETING).toContain("Готово");
    expect(VK_GREETING).toContain("15 минут");
  });
});

describe("кто пришёл поздороваться", () => {
  it("узнаёт «Начать», приветствия и помощь без учёта регистра и знаков", () => {
    for (const text of ["Начать", "начать", " НАЧАТЬ! ", "/start", "Start", "Привет", "привет!!", "Здравствуйте.", "Добрый  день", "Помощь", "help"]) {
      expect(isStartMessage(text), text).toBe(true);
    }
  });

  it("узнаёт кнопку «Начать» по служебному payload, даже если текст другой", () => {
    expect(isStartMessage("что угодно", '{"command":"start"}')).toBe(true);
    expect(isStartMessage("что угодно", '{"command":"other"}')).toBe(false);
    expect(isStartMessage("что угодно", "не json")).toBe(false);
  });

  it("не путает с вопросом, кодом и пустым сообщением", () => {
    for (const text of ["как дела?", "042917", "", "привет, мне нужна помощь с кабинетом"]) {
      expect(isStartMessage(text), text).toBe(false);
    }
  });
});

describe("webhook сообщества", () => {
  beforeEach(() => {
    vi.stubEnv("VK_GROUP_ID", GROUP);
    vi.stubEnv("VK_CALLBACK_SECRET", SECRET);
    vi.stubEnv("VK_CALLBACK_CONFIRMATION", CONFIRM);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("подтверждает адрес строкой из настроек ВК — только для своего сообщества", async () => {
    const ok = await POST(callback({ type: "confirmation", group_id: Number(GROUP) }));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(CONFIRM);

    const foreign = await POST(callback({ type: "confirmation", group_id: 999 }));
    expect(foreign.status).toBe(403);
  });

  it("отвечает 403 на событие без верного секрета и ничего не делает", async () => {
    const res = await POST(
      callback({
        type: "message_new",
        group_id: Number(GROUP),
        secret: "wrong",
        object: { message: { from_id: 42, text: "042917" } },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("принятое событие с верным секретом получает «ok» — иначе ВК повторит его", async () => {
    const res = await POST(
      callback({
        type: "message_new",
        group_id: Number(GROUP),
        secret: SECRET,
        object: { message: { from_id: -5, text: "" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("не настроенный webhook честно говорит, что не настроен", async () => {
    vi.stubEnv("VK_CALLBACK_SECRET", "");
    const res = await POST(callback({ type: "message_new", group_id: Number(GROUP) }));
    expect(res.status).toBe(503);
  });
});
