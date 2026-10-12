// @vitest-environment jsdom
/**
 * Плашки, что появляются в ответ на действие, объявляются сразу (замечание проверки PR #120, 12.10.2026).
 *
 * `Alert` без `variant` стал `role="status"` вместо `alert`. Для постоянных подсказок это верно, а для плашек, что
 * вставляются в страницу уже с текстом после попытки входа или отправки формы встречи, — риск молчания: живая область,
 * которой не было до появления текста, объявляется не везде.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/phone-login", () => ({
  PhoneLogin: ({ onNeedsRegistration }: { onNeedsRegistration?: () => void }) => (
    <button type="button" onClick={onNeedsRegistration}>
      Телефон подтверждён
    </button>
  ),
}));
vi.mock("@/components/motion/fold", () => ({ Fold: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { QuickLogin } from "@/app/(public)/login/quick-login";

afterEach(cleanup);

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("вход по номеру: «Аккаунта с таким входом пока нет»", () => {
  it("после подтверждённого номера без аккаунта появляется role=alert со ссылкой на регистрацию", async () => {
    render(
      <QuickLogin phoneEnabled>
        <form aria-label="Пароль" />
      </QuickLogin>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Телефон подтверждён" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Аккаунта с таким входом пока нет");
    expect(screen.getByRole("link", { name: "Зарегистрируйтесь" })).toHaveAttribute("href", "/register");
  });
});

describe("встреча: «Возможные накладки»", () => {
  it("предупреждение (треугольник) с role=alert: плашка вставляется после отправки формы", () => {
    const text = source("components/interviews/interview-section.tsx");
    const at = text.indexOf("Возможные накладки");
    const open = Math.max(text.lastIndexOf("<Alert ", at), text.lastIndexOf("<Alert>", at));
    const tag = text.slice(open, text.indexOf(">", open) + 1);
    expect(tag).toMatch(/variant="warning"/);
    expect(tag).toMatch(/role="alert"/);
  });
});
