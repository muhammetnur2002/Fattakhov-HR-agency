// @vitest-environment jsdom
/**
 * Панель «поиск + фильтры» над списком — один шаблон на все списки кабинета.
 *
 * Сверка по скриншотам заказчика: поле поиска было короткое и разной длины
 * в разных разделах (283, 400, 480 точек), подсказка в шапке обрезалась.
 * Здесь — что шаблон делает: поиск первой строкой своей ширины, фильтры под
 * ним, и что ширина берётся из одного места.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LIST_SEARCH_CLASS, ListSearchInput, ListToolbar } from "@/components/shell/list-toolbar";

describe("ListSearchInput", () => {
  it("ширина — из LIST_SEARCH_CLASS, а название поля — отдельным aria-label", () => {
    const { container } = render(
      <ListSearchInput label="Поиск по вакансиям" placeholder="Название, город…" defaultValue="" />,
    );
    const box = container.querySelector('[data-slot="list-search"]')!;
    for (const cls of LIST_SEARCH_CLASS.split(" ")) expect(box.className).toContain(cls);
    expect(screen.getByRole("textbox", { name: "Поиск по вакансиям" })).toHaveProperty("placeholder", "Название, город…");
  });
});

describe("ListToolbar", () => {
  it("поиск идёт первым, фильтры — отдельной строкой под ним", () => {
    const { container } = render(
      <ListToolbar search={<input aria-label="поиск" />} filters={<button type="button">статус</button>} />,
    );
    const toolbar = container.querySelector('[data-slot="list-toolbar"]')!;
    expect(toolbar.children).toHaveLength(2);
    expect(toolbar.children[0].matches("input")).toBe(true);
    expect(toolbar.children[1].querySelector("button")).not.toBeNull();
    // Поиск не лежит в одном ряду с фильтрами: иначе его ширина зависит от их числа
    expect(toolbar.children[1].contains(toolbar.children[0])).toBe(false);
  });

  it("без фильтров — только поиск, пустой строки нет", () => {
    const { container } = render(<ListToolbar search={<input aria-label="поиск" />} />);
    expect(container.querySelector('[data-slot="list-toolbar"]')!.children).toHaveLength(1);
  });
});
