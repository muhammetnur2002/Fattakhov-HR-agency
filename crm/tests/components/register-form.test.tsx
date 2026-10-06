// @vitest-environment jsdom
/**
 * Форма регистрации: один способ на экране, согласие общее.
 *
 * Вкладки только две — телефон и почта: Telegram-вход убран вместе
 * с Telegram-ботом (04.10.2026). Вкладка «Почта» — прежняя регистрация по почте (/register/company):
 * почта, телефон, пароль и код из письма, но с общей галочкой согласия.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { requestCompanyRegistrationAction } = vi.hoisted(() => ({
  requestCompanyRegistrationAction: vi.fn(),
}));

vi.mock("@/app/(public)/register/actions", () => ({
  requestCompanyRegistrationAction,
  confirmCompanyRegistrationAction: vi.fn(),
}));
vi.mock("@/app/actions/quick-auth", () => ({
  requestPhoneCodeAction: vi.fn(),
  phoneSignInAction: vi.fn(),
}));

import { RegisterForm } from "@/app/(public)/register/register-form";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // Подсказка «отметьте согласие» доводит до галочки прокруткой —
  // в jsdom нет ни прокрутки, ни медиазапросов
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

beforeEach(() => {
  requestCompanyRegistrationAction.mockReset();
  requestCompanyRegistrationAction.mockResolvedValue({ sent: true });
});

function renderForm(props: Partial<React.ComponentProps<typeof RegisterForm>> = {}) {
  render(
    <RegisterForm
      consentText="Текст согласия полностью"
      privacyHref="/privacy"
      phoneEnabled
      {...props}
    />,
  );
}

// Radix переключает вкладку по нажатию кнопки мыши, не по click
const openTab = (name: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("регистрация: способы по одному", () => {
  it("вкладки в порядке: телефон, почта; открыт телефон", () => {
    renderForm();

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Телефон",
      "Почта",
    ]);
    expect(screen.getByLabelText("Номер телефона")).toBeInTheDocument();
    expect(screen.queryByLabelText("Рабочая почта")).not.toBeInTheDocument();
  });

  it("доступна только почта — вкладок нет, сразу форма", () => {
    renderForm({ phoneEnabled: false });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Рабочая почта")).toBeInTheDocument();
  });

  it("согласие, отмеченное на одной вкладке, остаётся отмеченным на другой", () => {
    renderForm();

    fireEvent.click(screen.getByRole("checkbox"));
    openTab("Почта");

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("Telegram-вкладки нет — входа и регистрации через Telegram больше не существует", () => {
    renderForm();

    expect(screen.queryByRole("tab", { name: "Telegram" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Telegram/ })).not.toBeInTheDocument();
  });

  it("телефон до согласия — по нажатию подсветка у галочки", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Номер телефона"), {
      target: { value: "+7 900 123-45-67" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Получить код по SMS" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Сначала отметьте согласие");
    expect(screen.getByRole("checkbox")).toHaveFocus();
  });

  it("на вкладке телефона галочка — над кнопкой", () => {
    renderForm();

    const consent = screen.getByRole("checkbox");
    const button = screen.getByRole("button", { name: "Получить код по SMS" });
    expect(consent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("вкладка «Почта» — прежняя регистрация по почте", () => {
  function fillEmailForm() {
    fireEvent.change(screen.getByLabelText("Рабочая почта"), {
      target: { value: "hr@example.com" },
    });
    // По роли: «Телефон» — ещё и подпись панели одноимённой вкладки
    fireEvent.change(screen.getByRole("textbox", { name: "Телефон" }), {
      target: { value: "+7 900 123-45-67" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "длинный-пароль-1" } });
  }

  const submitEmail = () =>
    fireEvent.submit(screen.getByRole("button", { name: "Получить код на почту" }).closest("form")!);

  it("прежний адрес /register/company открывает сразу почту", () => {
    renderForm({ initialMethod: "email" });

    expect(screen.getByRole("tab", { name: "Почта" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Рабочая почта")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
  });

  it("без согласия код не запрашивается — подсвечивается галочка", () => {
    renderForm({ initialMethod: "email" });
    fillEmailForm();

    submitEmail();

    expect(screen.getByRole("alert")).toHaveTextContent("Сначала отметьте согласие");
    expect(screen.getByRole("checkbox")).toHaveFocus();
    expect(requestCompanyRegistrationAction).not.toHaveBeenCalled();
  });

  it("с согласием — галочка уходит вместе с формой, дальше поле для кода", async () => {
    renderForm({ initialMethod: "email" });
    fillEmailForm();
    fireEvent.click(screen.getByRole("checkbox"));

    submitEmail();

    expect(await screen.findByLabelText("Код из письма")).toBeInTheDocument();
    const sent = requestCompanyRegistrationAction.mock.calls[0][1] as FormData;
    expect(sent.get("consent")).toBe("on");
    expect(sent.get("email")).toBe("hr@example.com");
  });
});
