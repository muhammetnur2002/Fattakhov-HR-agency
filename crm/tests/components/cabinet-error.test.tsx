// @vitest-environment jsdom
/**
 * Сбой страницы внутри кабинета: меню остаётся, заменяется только область страницы.
 *
 * Без error.tsx в кабинетах ошибку перехватывал корневой app/error.tsx и заменял собой
 * всю оболочку — пропадали меню и нижняя панель. Теперь у каждого кабинета свой error.tsx
 * (экран один на всех — ErrorScreen), а на уровне корня экран остаётся полноэкранным.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import AgencyError from "@/app/(agency)/a/error";
import ClientError from "@/app/(client)/error";
import AppError from "@/app/error";

// Sentry подгружается динамически и только при заданном DSN (lib/monitoring/capture-client.ts)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example.invalid/1");
});

afterEach(async () => {
  cleanup();
  // Тест мог не дожидаться отправки в Sentry (она идёт через динамический импорт): доводим её до конца,
  // чтобы вызов не попал в следующий тест
  await flush();
  captureException.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const failure = () => Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432 secret-candidate-name"), { digest: "d1g3st" });

describe("error.tsx внутри кабинета", () => {
  for (const [name, Screen, home] of [
    ["клиента", ClientError, "/dashboard"],
    ["агентства", AgencyError, "/a"],
  ] as const) {
    it(`кабинет ${name}: заголовок, код сбоя, три кнопки; «На главную» ведёт в свой кабинет`, async () => {
      render(<Screen error={failure()} reset={() => {}} />);

      expect(screen.getByRole("heading", { level: 1, name: "Что-то пошло не так" })).toBeTruthy();
      expect(screen.getByText("d1g3st")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Попробовать снова" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", home);
      await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    });

    it(`кабинет ${name}: текста исключения на экране нет, свой main не добавляется`, () => {
      const { container } = render(<Screen error={failure()} reset={() => {}} />);

      // Сообщение исключения может нести кусок запроса или имя кандидата
      expect(container.textContent).not.toMatch(/ECONNREFUSED|secret-candidate-name/);
      // main уже есть у оболочки кабинета (AppShell): второй сломал бы ориентиры
      expect(container.querySelector("main")).toBeNull();
    });

    it(`кабинет ${name}: устаревшая вкладка — «Страница устарела» без повтора и без Sentry`, async () => {
      render(<Screen error={new UnrecognizedActionError("Server Action not found")} reset={() => {}} />);

      expect(screen.getByRole("heading", { level: 1, name: "Страница устарела" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Попробовать снова" })).toBeNull();
      await flush();
      expect(captureException).not.toHaveBeenCalled();
    });
  }

  it("«Попробовать снова» берёт страницу заново (retry), если Next его передал, иначе перерисовывает (reset)", () => {
    const reset = vi.fn();
    const retry = vi.fn();
    const { unmount } = render(<ClientError error={failure()} reset={reset} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    unmount();

    render(<ClientError error={failure()} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("корневой error.tsx", () => {
  it("оболочки вокруг нет — экран сам несёт единственный main и ведёт на главную сайта", () => {
    const { container } = render(<AppError error={failure()} reset={() => {}} />);

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/");
  });
});
