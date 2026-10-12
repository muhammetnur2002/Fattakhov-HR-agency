// @vitest-environment jsdom
/**
 * Button: загрузка не ломает кнопку-ссылку (asChild) и сообщает о занятости.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "@/components/ui/button";

describe("Button", () => {
  it("loading: недоступна, объявляет занятость и показывает индикатор", () => {
    render(<Button loading>Сохранить</Button>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("без loading — обычная кнопка без индикатора и aria-busy", () => {
    render(<Button>Сохранить</Button>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("asChild: ссылка остаётся единственным ребёнком, индикатор не вставляется", () => {
    render(
      <Button asChild loading>
        <a href="/x">Открыть</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Открыть" });
    expect(link.querySelector("svg")).toBeNull();
  });

  it("disabled без loading остаётся выключенной", () => {
    render(<Button disabled>Выключена</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });
});

describe("нажатие кнопки заметно на телефоне", () => {
  // Сверка 11.10.2026: основная при нажатии получала цвет наведения (1,2:1), у контурной нажатие было
  // --muted (1,05:1), у ссылки не было вовсе. Наведения на телефоне нет — нажатие и есть весь отклик.
  const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
  const classesOf = (variant: (typeof VARIANTS)[number]) => buttonVariants({ variant }).split(/\s+/);

  it.each(VARIANTS)("%s: у нажатия свой цвет или подчёркивание", (variant) => {
    const cls = classesOf(variant);
    const pressed = cls.filter((c) => /^active:(bg-|text-|underline)/.test(c));
    expect(pressed.length, "есть отклик на нажатие").toBeGreaterThan(0);
    // Фон нажатия не равен фону наведения: иначе нажатие неотличимо от курсора на кнопке
    const hoverBg = cls.find((c) => /^hover:bg-/.test(c))?.replace(/^hover:/, "");
    for (const c of pressed.filter((x) => x.startsWith("active:bg-"))) {
      expect(c.replace(/^active:/, ""), "нажатый фон отличается от наведения").not.toBe(hoverBg);
    }
  });

  it.each(VARIANTS)("%s: на сенсорном экране кнопка чуть сжимается", (variant) => {
    expect(classesOf(variant)).toContain("touch:active:scale-[0.98]");
  });

  it("основная нажимается в отдельный токен, а не в цвет наведения", () => {
    const cls = classesOf("default");
    expect(cls).toContain("active:bg-primary-active");
    expect(cls).not.toContain("active:bg-primary-hover");
  });
});

