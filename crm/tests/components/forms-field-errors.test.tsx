// @vitest-environment jsdom
/**
 * Переведённые формы: ошибка стоит у поля, набранное остаётся, пароль после успеха стирается.
 *
 * Сверка 11.10.2026: `<form action={formAction}>` очищал форму после любого ответа сервера, и «пароли не совпадают»
 * стирали имя и почту; ошибка приходила одной строкой без указания поля.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changePasswordAction: vi.fn(),
  recordOfferAction: vi.fn(),
}));
vi.mock("@/app/actions/passwords", () => ({ changePasswordAction: mocks.changePasswordAction }));
vi.mock("@/app/(agency)/a/candidates/actions", () => ({ recordOfferAction: mocks.recordOfferAction }));

import { OfferForm } from "@/components/applications/offer-form";
import { CreateClientUserForm } from "@/components/clients/create-user-form";
import { InviteForm } from "@/components/clients/invite-form";
import { PasswordForm } from "@/components/settings/password-form";
import type { FormState } from "@/lib/form-state";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("создание пользователя клиента", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("Почта"), "anna@starfish");
    await user.type(screen.getByLabelText("Имя и фамилия"), "Анна Петрова");
    await user.type(screen.getByLabelText("Пароль", { exact: true }), "длинная-фраза-77");
    await user.type(screen.getByLabelText("Пароль ещё раз"), "другая-фраза-88");
  };

  it("отказ: ошибки у своих полей, фокус на первом, набранное остаётся", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>(async () => ({
      error: "Проверьте заполнение полей",
      fields: { email: "Проверьте адрес почты", passwordConfirm: "Пароли не совпадают" },
    }));
    render(<CreateClientUserForm clientId="c1" action={action} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    const email = await screen.findByLabelText("Почта");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription("Проверьте адрес почты");
    expect(screen.getByLabelText("Пароль ещё раз")).toHaveAccessibleDescription("Пароли не совпадают");
    expect(email).toHaveFocus();
    // Раньше после ответа форма была пустой
    expect(screen.getByLabelText("Имя и фамилия")).toHaveValue("Анна Петрова");
    expect(email).toHaveValue("anna@starfish");
    expect(screen.getByLabelText("Пароль", { exact: true })).toHaveValue("длинная-фраза-77");
    // Поля без ошибки не помечены
    expect(screen.getByLabelText("Имя и фамилия")).not.toHaveAttribute("aria-invalid");
    // В действие ушёл clientId из скрытого поля вместе с остальным
    expect((action.mock.calls[0][1] as FormData).get("clientId")).toBe("c1");
  });

  it("успех: форма очищается, пароль не остаётся в странице", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<FormState> => ({ ok: "Аккаунт создан" }));
    render(<CreateClientUserForm clientId="c1" action={action} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(await screen.findByText("Аккаунт создан")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Имя и фамилия")).toHaveValue("");
  });
});

describe("смена пароля", () => {
  it("неверный текущий: ошибка у его поля, оно очищено, новый пароль остался", async () => {
    mocks.changePasswordAction.mockResolvedValue({ fields: { currentPassword: "Текущий пароль неверен" } });
    const user = userEvent.setup();
    render(<PasswordForm />);
    await user.type(screen.getByLabelText("Текущий пароль"), "старый-пароль");
    await user.type(screen.getByLabelText("Новый пароль"), "новая-длинная-фраза-91");
    await user.type(screen.getByLabelText("Повторите новый"), "новая-длинная-фраза-91");
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));

    const current = await screen.findByLabelText("Текущий пароль");
    await waitFor(() => expect(current).toHaveAttribute("aria-invalid", "true"));
    expect(current).toHaveAccessibleDescription("Текущий пароль неверен");
    expect(current).toHaveValue("");
    expect(current).toHaveFocus();
    expect(screen.getByLabelText("Новый пароль")).toHaveValue("новая-длинная-фраза-91");
  });

  it("слабый новый пароль: текущий не стирается — отказ не про него", async () => {
    mocks.changePasswordAction.mockResolvedValue({ fields: { newPassword: "Это слишком распространённый пароль" } });
    const user = userEvent.setup();
    render(<PasswordForm />);
    await user.type(screen.getByLabelText("Текущий пароль"), "старый-пароль");
    await user.type(screen.getByLabelText("Новый пароль"), "password12345");
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect(await screen.findByText("Это слишком распространённый пароль")).toBeInTheDocument();
    expect(screen.getByLabelText("Текущий пароль")).toHaveValue("старый-пароль");
  });

  it("успех: все три поля пусты", async () => {
    mocks.changePasswordAction.mockResolvedValue({ ok: "Пароль изменён" });
    const user = userEvent.setup();
    render(<PasswordForm />);
    await user.type(screen.getByLabelText("Текущий пароль"), "старый-пароль");
    await user.type(screen.getByLabelText("Новый пароль"), "новая-длинная-фраза-91");
    await user.type(screen.getByLabelText("Повторите новый"), "новая-длинная-фраза-91");
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect(await screen.findByText("Пароль изменён")).toBeInTheDocument();
    for (const label of ["Текущий пароль", "Новый пароль", "Повторите новый"]) {
      expect(screen.getByLabelText(label)).toHaveValue("");
    }
  });
});

describe("оффер", () => {
  it("сумма неверна: текст под полем суммы, должность и дата остаются", async () => {
    mocks.recordOfferAction.mockResolvedValue({
      error: "Проверьте заполнение полей",
      fields: { salary: "Слишком большая сумма" },
    });
    const user = userEvent.setup();
    render(<OfferForm applicationId="a1" salary={null} position={null} startDate={null} />);
    await user.type(screen.getByLabelText("Сумма оффера, ₽ в месяц"), "150000000");
    await user.type(screen.getByLabelText("Должность в оффере"), "Менеджер");
    await user.click(screen.getByRole("button", { name: "Сохранить оффер" }));
    const salary = await screen.findByLabelText("Сумма оффера, ₽ в месяц");
    await waitFor(() => expect(salary).toHaveAttribute("aria-invalid", "true"));
    expect(salary).toHaveAccessibleDescription("Слишком большая сумма");
    expect(screen.getByLabelText("Должность в оффере")).toHaveValue("Менеджер");
    expect(salary).toHaveFocus();
  });

  it("успех: «Оффер сохранён» — плашка с галочкой, значения остаются (это сохранённое)", async () => {
    mocks.recordOfferAction.mockResolvedValue({ ok: "Оффер сохранён" });
    const user = userEvent.setup();
    render(<OfferForm applicationId="a1" salary={200000} position="Менеджер" startDate={null} />);
    await user.click(screen.getByRole("button", { name: "Сохранить оффер" }));
    const status = await screen.findByText("Оффер сохранён");
    expect(status.closest("[data-form-message=ok]")?.querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("Должность в оффере")).toHaveValue("Менеджер");
  });
});

describe("приглашение коллеги", () => {
  it("адрес неверен: поле помечено, текст — под рядом, остальное не стёрто", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      error: "Проверьте заполнение полей",
      fields: { email: "Проверьте адрес почты" },
    }));
    const user = userEvent.setup();
    render(<InviteForm clientId="c1" action={action} />);
    await user.type(screen.getByLabelText("Почта"), "kollega@starfish");
    await user.type(screen.getByLabelText("Должность"), "Руководитель отдела");
    await user.click(screen.getByRole("button", { name: "Пригласить" }));
    const email = await screen.findByLabelText("Почта");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription("Проверьте адрес почты");
    expect(email).toHaveFocus();
    expect(screen.getByLabelText("Должность")).toHaveValue("Руководитель отдела");
  });
});
