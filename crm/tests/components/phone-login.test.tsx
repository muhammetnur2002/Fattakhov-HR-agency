// @vitest-environment jsdom
/**
 * Вход и регистрация по номеру телефона: порядок проверок.
 *
 * Скриншот с iPhone (24.09.2026): неверный номер, «Получить код» — и
 * вместо ошибки у поля номера страница уехала к галочке согласия,
 * а под ней нажали чужую кнопку. Номер проверяется первым, прямо
 * в браузере, той же функцией, что и на сервере: с неверным номером
 * согласие ничего не решит, а ошибка должна стоять там, где её чинить.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPhoneCodeAction, phoneSignInAction } = vi.hoisted(() => ({
  requestPhoneCodeAction: vi.fn(),
  phoneSignInAction: vi.fn(),
}));

vi.mock("@/app/actions/quick-auth", () => ({ requestPhoneCodeAction, phoneSignInAction }));

import { PhoneLogin } from "@/components/auth/phone-login";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

beforeEach(() => {
  requestPhoneCodeAction.mockReset();
  requestPhoneCodeAction.mockResolvedValue({ phone: "+79001234567", sentTo: "+7 900 ***-**-67" });
  phoneSignInAction.mockReset();
});

function renderPhone(props: Partial<React.ComponentProps<typeof PhoneLogin>> = {}) {
  const onNeedsConsent = vi.fn();
  const onActiveChange = vi.fn();
  render(
    <PhoneLogin
      consent={false}
      requireConsent
      submitLabel="Зарегистрироваться"
      onNeedsConsent={onNeedsConsent}
      onActiveChange={onActiveChange}
      {...props}
    />,
  );
  return { onNeedsConsent, onActiveChange };
}

const phoneField = () => screen.getByLabelText("Номер телефона");
const getCode = () => fireEvent.click(screen.getByRole("button", { name: "Получить код по SMS" }));

describe("вход по телефону: сначала номер, потом согласие", () => {
  it("неверный номер — ошибка у поля, без похода к серверу и к галочке", () => {
    const { onNeedsConsent } = renderPhone();

    fireEvent.change(phoneField(), { target: { value: "564636363" } });
    getCode();

    expect(screen.getByRole("alert")).toHaveTextContent("Проверьте номер");
    expect(phoneField()).toHaveAttribute("aria-invalid", "true");
    expect(onNeedsConsent).not.toHaveBeenCalled();
    expect(requestPhoneCodeAction).not.toHaveBeenCalled();
  });

  it("исправили номер — ошибка уходит сразу, не дожидаясь нового нажатия", () => {
    renderPhone();

    fireEvent.change(phoneField(), { target: { value: "564636363" } });
    getCode();
    fireEvent.change(phoneField(), { target: { value: "+7 900 123-45-67" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("верный номер без согласия — просит галочку, код не запрашивает", () => {
    const { onNeedsConsent } = renderPhone();

    fireEvent.change(phoneField(), { target: { value: "+7 900 123-45-67" } });
    getCode();

    expect(onNeedsConsent).toHaveBeenCalledTimes(1);
    expect(requestPhoneCodeAction).not.toHaveBeenCalled();
  });

  it("верный номер с согласием — код запрошен, на экране ввод кода", async () => {
    const { onActiveChange } = renderPhone({ consent: true });

    fireEvent.change(phoneField(), { target: { value: "8 900 123-45-67" } });
    getCode();

    expect(await screen.findByLabelText("Код из SMS")).toBeInTheDocument();
    expect(requestPhoneCodeAction).toHaveBeenCalledWith("8 900 123-45-67");
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
  });

  it("«Другой номер» возвращает к номеру и сообщает странице", async () => {
    const { onActiveChange } = renderPhone({ consent: true });

    fireEvent.change(phoneField(), { target: { value: "+7 900 123-45-67" } });
    getCode();
    fireEvent.click(await screen.findByRole("button", { name: "Другой номер" }));

    expect(await screen.findByLabelText("Номер телефона")).toBeInTheDocument();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("на входе согласия не нужно — код запрашивается сразу", async () => {
    const { onNeedsConsent } = renderPhone({ requireConsent: false, submitLabel: "Войти" });

    fireEvent.change(phoneField(), { target: { value: "+7 900 123-45-67" } });
    getCode();

    expect(await screen.findByLabelText("Код из SMS")).toBeInTheDocument();
    expect(onNeedsConsent).not.toHaveBeenCalled();
  });

  it("галочка согласия стоит между номером и кнопкой", () => {
    renderPhone({ beforeSubmit: <label>Согласие<input type="checkbox" /></label> });

    const field = phoneField();
    const consent = screen.getByRole("checkbox");
    const button = screen.getByRole("button", { name: "Получить код по SMS" });

    expect(field.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(consent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
