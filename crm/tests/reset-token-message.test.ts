/**
 * Пустой токен в форме сброса пароля: общее русское сообщение (замечание проверки PR #120, 12.10.2026).
 *
 * У `resetPasswordSchema.token` не было своего текста («Too small: expected string to have >=1 characters»), а в форме
 * для токена нет поля: ошибка легла бы в `fields.token`, и человек увидел бы одну сводку «Проверьте заполнение полей»
 * без причины. Теперь у токена русский текст, и действие показывает его общей ошибкой, а не ошибкой несуществующего поля.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: async () => ({}) }));
vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: true }),
  rateLimitMessage: () => "Слишком часто",
}));

import { resetPasswordAction } from "@/app/actions/passwords";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("resetPasswordAction: токен", () => {
  it("пустой токен — общая ошибка по-русски, без ошибки несуществующего поля", async () => {
    const state = await resetPasswordAction(
      {},
      form({ token: "", newPassword: "длинная-фраза-77", newPasswordConfirm: "длинная-фраза-77" }),
    );
    expect(state).toEqual({ error: "Ссылка недействительна — запросите новую" });
  });

  it("пароли не совпадают при живом токене — по-прежнему у поля подтверждения", async () => {
    const state = await resetPasswordAction(
      {},
      form({ token: "tok", newPassword: "длинная-фраза-77", newPasswordConfirm: "другая-фраза-88" }),
    );
    expect(state.fields).toEqual({ newPasswordConfirm: "Пароли не совпадают" });
  });
});
