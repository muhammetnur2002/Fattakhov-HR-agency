/**
 * Канал ВКонтакте.
 *
 * Самое важное здесь: отказ ВК приходит с кодом ответа 200, и разбор,
 * который смотрит на код, отвечал бы «доставлено» всегда. Второе — что ВК
 * (единственный мессенджер-канал) агентству пишет всегда, а клиенту только
 * по его собственной привязке.
 */
import { describe, expect, it } from "vitest";

import { channelsForSide } from "@/lib/notifications/events";
import {
  parseVkResponse,
  vkHumanError,
  vkScreenName,
} from "@/lib/notifications/vk-api";

describe("разбор ответа ВК", () => {
  it("успех — это поле response", () => {
    expect(parseVkResponse({ response: 42 }, 200)).toEqual({ ok: true, value: 42 });
  });

  it("отказ с кодом 200 остаётся отказом", () => {
    const result = parseVkResponse(
      { error: { error_code: 901, error_msg: "Can't send messages for users without permission" } },
      200,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(901);
  });

  it("пустой ответ не роняет разбор", () => {
    const result = parseVkResponse(null, 502);
    expect(result.ok).toBe(false);
  });

  it("частые отказы объясняются по-русски, а не кодом", () => {
    expect(vkHumanError(901)).toContain("Разрешить сообщения");
    expect(vkHumanError(5)).toContain("ключ");
    expect(vkHumanError(null)).toBeNull();
    expect(vkHumanError(123456)).toBeNull();
  });
});

describe("адрес страницы — в том виде, в каком его вставляют", () => {
  it.each([
    ["https://vk.com/durov", "durov"],
    ["vk.com/durov", "durov"],
    ["https://m.vk.com/durov?from=search", "durov"],
    ["https://vk.ru/id123456", "id123456"],
    ["@durov", "durov"],
    ["id123456", "id123456"],
    ["123456", "123456"],
    ["  vk.com/ivan.petrov  ", "ivan.petrov"],
  ])("%s → %s", (input, expected) => {
    expect(vkScreenName(input)).toBe(expected);
  });

  it.each([["", null], ["https://example.com/durov", null], ["имя фамилия", null]])(
    "%s — не адрес",
    (input, expected) => {
      expect(vkScreenName(input)).toBe(expected);
    },
  );
});

describe("куда уходит ВК", () => {
  it("агентству — всегда, клиенту — только по его привязке", () => {
    expect(channelsForSide(["email", "vk"], true, false)).toEqual(["email", "vk"]);
    expect(channelsForSide(["email", "vk"], false, false)).toEqual(["email"]);
    expect(channelsForSide(["email", "vk"], false, true)).toEqual(["email", "vk"]);
  });

  it("ВК и пуш независимы: привязка одного не открывает другой", () => {
    const all = ["email", "vk", "push"] as const;
    expect(channelsForSide(all, false, true, false)).toEqual(["email", "vk"]);
    expect(channelsForSide(all, false, false, true)).toEqual(["email", "push"]);
  });
});
