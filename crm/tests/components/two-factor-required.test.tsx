// @vitest-environment jsdom
/**
 * Экран обязательной настройки 2FA.
 *
 * Что держим: на первом шаге без пароля (или кода из SMS) не продолжить;
 * после подтверждения кода показываются коды восстановления, и в кабинет
 * ведёт только кнопка после галочки «сохранил(а)» — иначе человек уходил бы
 * из экрана, не увидев кодов, единственный раз, когда они есть; а тому, у
 * кого 2FA уже включена и кодов на экране нет, показывается ссылка в кабинет,
 * а не настройка заново.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/two-factor", () => ({
  startTwoFactorAction: vi.fn(),
  requestTwoFactorSmsAction: vi.fn(),
  confirmTwoFactorAction: vi.fn(),
  disableTwoFactorAction: vi.fn(),
  regenerateCodesAction: vi.fn(),
}));
vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));

import { TwoFactorRequired } from "@/components/settings/two-factor-required";

describe("первый шаг", () => {
  it("просит текущий пароль и даёт выйти", () => {
    render(<TwoFactorRequired status={{ proof: "password", maskedPhone: null }} enabled={false} homeHref="/a" />);

    expect(screen.getByLabelText("Текущий пароль")).toBeTruthy();
    expect(screen.getByText("Шаг 1 из 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выйти из кабинета" })).toBeTruthy();
  });

  it("у вошедших по SMS — вместо пароля код из SMS", () => {
    render(<TwoFactorRequired status={{ proof: "sms", maskedPhone: "+7 900 ***-**-67" }} enabled={false} homeHref="/a" />);

    expect(screen.queryByLabelText("Текущий пароль")).toBeNull();
    expect(screen.getByRole("button", { name: "Получить код по SMS" })).toBeTruthy();
  });

  it("если нет ни пароля, ни телефона — отправляет задать пароль через «Забыли пароль»", () => {
    render(<TwoFactorRequired status={{ proof: "none", maskedPhone: null }} enabled={false} homeHref="/a" />);

    const link = screen.getByRole("link", { name: /Забыли пароль/ });
    expect(link.getAttribute("href")).toBe("/forgot");
  });
});

describe("уже включена", () => {
  it("настройку заново не предлагает: ссылка в кабинет", () => {
    render(<TwoFactorRequired status={{ proof: "password", maskedPhone: null }} enabled homeHref="/a" />);

    expect(screen.queryByLabelText("Текущий пароль")).toBeNull();
    expect(screen.getByText("Двухфакторная защита включена")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Перейти в кабинет" })).toBeTruthy();
  });
});
