// @vitest-environment jsdom
/**
 * Field: подпись, поле, подсказка и ошибка связаны для читалки.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Field, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

afterEach(cleanup);

describe("Field", () => {
  it("подпись привязана к полю: getByLabelText находит его", () => {
    render(
      <Field label="Почта">
        <Input name="email" />
      </Field>,
    );
    expect(screen.getByLabelText("Почта")).toHaveAttribute("name", "email");
  });

  it("без ошибки поле не помечено неверным и не ссылается на пустоту", () => {
    render(
      <Field label="Почта">
        <Input name="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Почта");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("ошибка: aria-invalid, aria-describedby ведёт на её текст, значок «!»", () => {
    render(
      <Field label="Почта" error="Проверьте адрес почты">
        <Input name="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Почта");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Проверьте адрес почты");
    const error = document.getElementById(input.getAttribute("aria-describedby")!)!;
    expect(error.querySelector("svg")).not.toBeNull();
    // Ошибка у поля не role=alert: объявляется вместе с полем, когда на него уходит фокус
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("подсказка и ошибка читаются вместе, подсказка первой", () => {
    render(
      <Field label="ИНН" hint="10 цифр у компании, 12 у ИП" error="ИНН — 10 цифр">
        <Input name="inn" />
      </Field>,
    );
    expect(screen.getByLabelText("ИНН")).toHaveAccessibleDescription("10 цифр у компании, 12 у ИП ИНН — 10 цифр");
  });

  it("свои id и aria-describedby поля сохраняются", () => {
    render(
      <Field label="Сайт" error="Нужен https://">
        <Input id="site" name="site" aria-describedby="site-extra" />
      </Field>,
    );
    const input = screen.getByLabelText("Сайт");
    expect(input).toHaveAttribute("id", "site");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual(["site-extra", "site-error"]);
  });

  it("render-prop отдаёт поле, что лежит глубже (Select → SelectTrigger)", () => {
    render(
      <Field label="Роль" error="Выберите роль">
        {(control) => (
          <div>
            <button type="button" {...control}>
              выбрать
            </button>
          </div>
        )}
      </Field>,
    );
    const trigger = screen.getByLabelText("Роль");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Выберите роль");
  });

  it("пара подпись — поле держит шаг space-y-2 (правило form-spacing)", () => {
    const { container } = render(
      <Field label="Имя">
        <Input name="fullName" />
      </Field>,
    );
    expect(container.firstElementChild).toHaveClass("space-y-2");
  });

  it("FieldSet: ошибка группы — через aria-describedby, а помечена группа", () => {
    render(
      <FieldSet id="grants" legend="Доступы" error="Неизвестный доступ">
        <input type="checkbox" aria-label="Студенты" />
      </FieldSet>,
    );
    const group = screen.getByRole("group", { name: "Доступы" });
    expect(group).toHaveAttribute("data-invalid", "true");
    expect(group).toHaveAccessibleDescription("Неизвестный доступ");
  });
});
