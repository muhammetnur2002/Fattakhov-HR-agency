import { describe, expect, it } from "vitest";

import { enterSendsMessage } from "@/lib/chat-keys";

const key = (k: string, shiftKey = false, isComposing = false) => ({ key: k, shiftKey, nativeEvent: { isComposing } });

describe("Enter в поле сообщения", () => {
  it("компьютер: Enter отправляет, Shift+Enter переносит строку", () => {
    expect(enterSendsMessage(key("Enter"), false)).toBe(true);
    expect(enterSendsMessage(key("Enter", true), false)).toBe(false);
  });

  it("телефон: Enter всегда переносит строку, отправляет кнопка", () => {
    expect(enterSendsMessage(key("Enter"), true)).toBe(false);
  });

  it("другие клавиши и ввод через IME не отправляют", () => {
    expect(enterSendsMessage(key("a"), false)).toBe(false);
    expect(enterSendsMessage(key("Enter", false, true), false)).toBe(false);
  });
});
