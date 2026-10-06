// @vitest-environment jsdom
/**
 * Диалог «Сбросить 2FA»: снимает второй фактор с чужой учётки, поэтому
 * не срабатывает одним нажатием — сначала диалог с объяснением, и только
 * кнопка внутри него отправляет форму.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResetTwoFactorDialog } from "@/components/team/reset-two-factor-dialog";

describe("подтверждение сброса", () => {
  it("кнопка в списке только открывает диалог и действие не вызывает", () => {
    const action = vi.fn(async () => ({}));
    render(<ResetTwoFactorDialog member={{ id: "u1", fullName: "Игорь Пантелеев" }} action={action} />);

    expect(screen.queryByText("Сбросить 2FA сотруднику?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Сбросить 2FA/ }));

    expect(screen.getByText("Сбросить 2FA сотруднику?")).toBeTruthy();
    expect(screen.getByText(/Игорь Пантелеев потерял телефон/)).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("в диалоге есть отмена и подтверждение с идентификатором сотрудника", () => {
    render(<ResetTwoFactorDialog member={{ id: "u1", fullName: "Игорь Пантелеев" }} action={vi.fn(async () => ({}))} />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить 2FA/ }));

    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
    // Две кнопки с этим названием: открывающая (под диалогом) и подтверждающая
    expect(screen.getAllByRole("button", { name: /Сбросить 2FA/ }).length).toBeGreaterThanOrEqual(1);
    expect((document.querySelector('input[name="userId"]') as HTMLInputElement).value).toBe("u1");
  });
});
