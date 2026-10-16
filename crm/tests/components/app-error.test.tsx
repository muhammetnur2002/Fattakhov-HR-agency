// @vitest-environment jsdom
/**
 * Экран ошибки: устаревшая вкладка и настоящий сбой выглядят по-разному.
 *
 * После выкатки открытая вкладка шлёт действие, которого сервер не знает
 * (UnrecognizedActionError). Человеку нужно одно: обновить страницу. «Попробовать
 * снова» с той же вкладки упрётся в то же самое, а ошибку в Sentry слать незачем.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import AppError from "@/app/error";

// Sentry подгружается динамически и только при заданном DSN (lib/monitoring/capture-client.ts):
// без него первая загрузка страниц не несёт его код (около 165 КБ до сжатия)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example.invalid/1");
});

afterEach(async () => {
  cleanup();
  // Тест мог не дожидаться отправки в Sentry (она идёт через динамический импорт): доводим её до конца,
  // чтобы вызов не попал в следующий тест
  await flush();
  captureException.mockReset();
  vi.unstubAllEnvs();
});

describe("экран ошибки", () => {
  it("устаревшая вкладка: «Страница устарела», одна кнопка обновления, без «Попробовать снова» и без Sentry", async () => {
    render(<AppError error={new UnrecognizedActionError("Server Action not found")} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Страница устарела" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Попробовать снова" })).toBeNull();
    await flush();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("настоящий сбой: прежний экран с кодом и повтором, ошибка уходит в Sentry", async () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Что-то пошло не так" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Попробовать снова" })).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
  });

  it("DSN не задан (Sentry выключен намеренно): экран тот же, код Sentry не запрашивается и не вызывается", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Что-то пошло не так" })).toBeTruthy();
    await flush();
    expect(captureException).not.toHaveBeenCalled();
  });
});
