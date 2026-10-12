// @vitest-environment jsdom
/**
 * Форма вакансии студплатформы: отказ платформы по числам стоит у своего поля (проверка PR #120, 12.10.2026).
 *
 * `useFormAction` выключает проверку браузера (`noValidate`), и нативные `min`/`max` у «Оплата от», «Оплата до»,
 * «Часов в неделю» перестали ограничивать ввод в момент отправки. Диапазон 4–60 часов проверяет студплатформа и
 * отвечает `fields.hoursPerWeek`; у поля «Часов в неделю» (как и «Оплата от») не было места под текст ошибки: отказ
 * превращался в общую сводку без указания, что неверно.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_isUnrecognizedActionError: () => false,
}));

import { VacancyForm } from "@/app/(client)/students/vacancy-form";
import type { VacancyFormState } from "@/app/(client)/students/actions";

// Radix (Select, Checkbox) в jsdom требует ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

describe("форма вакансии: ошибка платформы у поля", () => {
  it("«Часов в неделю» и «Оплата от»: текст под полем, поле помечено, введённое остаётся", async () => {
    const action = vi.fn(
      async (): Promise<VacancyFormState> => ({
        error: "Проверьте заполнение полей",
        fields: { salaryFrom: "Не меньше нуля", hoursPerWeek: "До 60 часов" },
      }),
    );
    const user = userEvent.setup();
    render(<VacancyForm action={action} skipsModeration={false} />);

    await user.type(screen.getByLabelText("Должность"), "Курьер");
    await user.type(screen.getByLabelText("Часов в неделю"), "500");
    await user.click(screen.getAllByRole("button", { name: /Сохранить|Отправить/ })[0]);

    const hours = await screen.findByLabelText("Часов в неделю");
    await waitFor(() => expect(hours).toHaveAttribute("aria-invalid", "true"));
    expect(hours).toHaveAccessibleDescription("До 60 часов");
    expect(screen.getByLabelText("Оплата от")).toHaveAccessibleDescription("Не меньше нуля");
    // Раньше ввод терялся вместе с ответом; теперь остаётся
    expect(hours).toHaveValue(500);
    expect(screen.getByLabelText("Должность")).toHaveValue("Курьер");
    // Фокус на первом неверном поле — «Оплата от» стоит раньше «Часов в неделю»
    expect(screen.getByLabelText("Оплата от")).toHaveFocus();
  });
});
