// @vitest-environment jsdom
/**
 * Регистрация по почте, экран кода: «Прислать код ещё раз» с таймером и возврат к форме
 * с сохранённым вводом. Раньше повтора не было, а «Указать другую почту» стирала и телефон,
 * и пароль (10 и больше знаков).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  requestCompanyRegistrationAction: vi.fn(),
  confirmCompanyRegistrationAction: vi.fn(),
}));
vi.mock("@/app/(public)/register/actions", () => actions);

import { EmailRegistration } from "@/app/(public)/register/email-registration";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  actions.requestCompanyRegistrationAction.mockReset();
  actions.requestCompanyRegistrationAction.mockResolvedValue({ sent: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function toCodeScreen() {
  render(<EmailRegistration consent consentBox={null} onNeedsConsent={() => {}} />);
  fireEvent.change(screen.getByLabelText("Рабочая почта"), { target: { value: "a@firma.ru" } });
  fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "+7 900 123-45-67" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "длинная фраза 123" } });
  fireEvent.submit(screen.getByLabelText("Рабочая почта").closest("form")!);
  await screen.findByLabelText("Код из письма");
}

/** Таймер пересоздаётся после каждой секунды: время идёт по секунде, каждую — в своём act. */
async function waitMinute() {
  for (let i = 0; i < 61; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

describe("регистрация по почте: экран кода", () => {
  it("повтор кода недоступен 60 с, потом шлёт те же почту, телефон и пароль", async () => {
    await toCodeScreen();
    const resend = screen.getByRole("button", { name: /Прислать код ещё раз через \d+ с/ });
    expect(resend).toHaveProperty("disabled", true);

    await waitMinute();
    const ready = screen.getByRole("button", { name: "Прислать код ещё раз" });
    expect(ready).toHaveProperty("disabled", false);

    actions.requestCompanyRegistrationAction.mockClear();
    fireEvent.click(ready);
    await waitFor(() => expect(actions.requestCompanyRegistrationAction).toHaveBeenCalledTimes(1));
    const data = actions.requestCompanyRegistrationAction.mock.calls[0][1] as FormData;
    expect(data.get("email")).toBe("a@firma.ru");
    expect(data.get("phone")).toBe("+7 900 123-45-67");
    expect(data.get("password")).toBe("длинная фраза 123");
    expect(await screen.findByText(/Код отправлен ещё раз/)).toBeTruthy();
    // таймер запущен заново
    expect(screen.getByRole("button", { name: /через \d+ с/ })).toHaveProperty("disabled", true);
  }, 30_000);

  it("отказ при повторе показывается, таймер не сбрасывается", async () => {
    await toCodeScreen();
    await waitMinute();
    actions.requestCompanyRegistrationAction.mockResolvedValueOnce({ error: "Слишком часто. Попробуйте через 5 мин" });
    fireEvent.click(screen.getByRole("button", { name: "Прислать код ещё раз" }));
    expect(await screen.findByText("Слишком часто. Попробуйте через 5 мин")).toBeTruthy();
    // Текст отказа и конец перехода (кнопка «занята») — два разных коммита React: сразу после появления
    // текста кнопка ещё может быть занята, поэтому ждём, а не проверяем в тот же миг (плавала на загруженной машине)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Прислать код ещё раз" })).toHaveProperty("disabled", false),
    );
  }, 30_000);

  it("«Указать другую почту» возвращает форму с телефоном и паролем, а не пустую", async () => {
    await toCodeScreen();
    fireEvent.click(screen.getByRole("button", { name: "Указать другую почту" }));
    expect((screen.getByLabelText("Телефон") as HTMLInputElement).value).toBe("+7 900 123-45-67");
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).value).toBe("длинная фраза 123");
  });
});
