// @vitest-environment jsdom
/**
 * Экран ошибки: устаревшая вкладка и настоящий сбой выглядят по-разному.
 *
 * После выкатки открытая вкладка шлёт действие, которого сервер не знает
 * (UnrecognizedActionError). Человеку нужно одно: обновить страницу. «Попробовать
 * снова» с той же вкладки упрётся в то же самое, а ошибку в Sentry слать незачем.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import AppError from "@/app/error";

afterEach(() => {
  cleanup();
  captureException.mockReset();
});

describe("экран ошибки", () => {
  it("устаревшая вкладка: «Страница устарела», одна кнопка обновления, без «Попробовать снова» и без Sentry", () => {
    render(<AppError error={new UnrecognizedActionError("Server Action not found")} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Страница устарела" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Попробовать снова" })).toBeNull();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("настоящий сбой: прежний экран с кодом и повтором, ошибка уходит в Sentry", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Что-то пошло не так" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Попробовать снова" })).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
