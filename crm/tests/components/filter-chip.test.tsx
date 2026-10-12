// @vitest-environment jsdom
/**
 * Чип выбора: выбранное видно не только цветом (галочка), и сказано читалке экрана —
 * `aria-current` у ссылки, `aria-pressed` у кнопки, `aria-selected` у вкладки.
 * Раньше у ссылок-фильтров не было ни одного из них.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const link = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({
  // scroll и prefetch — свойства Link, не <a>: до обычной ссылки они не доходят
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { scroll?: boolean; prefetch?: boolean }) => (
    <a href={href} {...(Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "scroll" && key !== "prefetch")) as React.ComponentProps<"a">)}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: link.pending }),
}));

import { ListPendingProvider, ListRegion } from "@/components/shell/list-pending";
import { FilterChip, FilterChipGroup, SelectionCheck } from "@/components/ui/filter-chip";

afterEach(() => {
  cleanup();
  link.pending = false;
});

describe("FilterChip: ссылка", () => {
  it("выбранная — aria-current=\"true\", галочка и заливка основным цветом; невыбранная — ничего из этого", () => {
    render(
      <FilterChipGroup label="Статус клиента">
        <FilterChip href="/a/clients" selected>
          Все
        </FilterChip>
        <FilterChip href="/a/clients?status=lead" selected={false}>
          Лиды
        </FilterChip>
      </FilterChipGroup>,
    );
    const on = screen.getByRole("link", { name: "Все" });
    const off = screen.getByRole("link", { name: "Лиды" });

    expect(on.getAttribute("aria-current")).toBe("true");
    expect(on.querySelector('[data-slot="filter-chip-check"]')).not.toBeNull();
    expect(on.className).toContain("bg-primary");
    expect(on.getAttribute("href")).toBe("/a/clients");

    expect(off.hasAttribute("aria-current")).toBe(false);
    expect(off.querySelector('[data-slot="filter-chip-check"]')).toBeNull();
    expect(off.className).not.toContain("bg-primary");
  });

  it("группа названа для читалки экрана", () => {
    render(
      <FilterChipGroup label="Период">
        <FilterChip href="/x" selected={false}>
          Месяц
        </FilterChip>
      </FilterChipGroup>,
    );
    expect(screen.getByRole("group", { name: "Период" })).toBeTruthy();
  });

  it("пока переход идёт (useLinkStatus), на месте галочки крутится индикатор, а список помечен aria-busy", () => {
    link.pending = true;
    render(
      <ListPendingProvider>
        <FilterChipGroup label="Статус">
          <FilterChip href="/a/clients?status=lead" selected={false}>
            Лиды
          </FilterChip>
        </FilterChipGroup>
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    const chip = screen.getByRole("link", { name: "Лиды" });
    expect(chip.querySelector('[data-slot="filter-chip-pending"]')).not.toBeNull();
    expect(chip.querySelector('[data-slot="filter-chip-check"]')).toBeNull();
    expect(document.querySelector('[data-slot="list-region"]')?.getAttribute("aria-busy")).toBe("true");
  });
});

describe("FilterChip: кнопка и вкладка", () => {
  it("кнопка — aria-pressed вместо aria-current, нажатие доходит до обработчика", () => {
    const onClick = vi.fn();
    render(
      <>
        <FilterChip selected onClick={onClick}>
          Новые
        </FilterChip>
        <FilterChip selected={false} onClick={onClick}>
          Приглашены
        </FilterChip>
      </>,
    );
    const on = screen.getByRole("button", { name: "Новые" });
    const off = screen.getByRole("button", { name: "Приглашены" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(off.getAttribute("aria-pressed")).toBe("false");
    expect(on.hasAttribute("aria-current")).toBe(false);
    expect(on.getAttribute("type")).toBe("button");
    fireEvent.click(off);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("вкладка (role=tab) — aria-selected, а не aria-pressed", () => {
    render(
      <div role="tablist" aria-label="Этапы">
        <FilterChip role="tab" selected onClick={() => {}}>
          Скрининг
        </FilterChip>
        <FilterChip role="tab" selected={false} onClick={() => {}}>
          Интервью
        </FilterChip>
      </div>,
    );
    const [first, second] = screen.getAllByRole("tab");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("aria-selected")).toBe("false");
    expect(first.hasAttribute("aria-pressed")).toBe(false);
  });

  it("кнопка с pending показывает индикатор вместо галочки", () => {
    render(
      <FilterChip selected pending onClick={() => {}}>
        Все
      </FilterChip>,
    );
    const chip = screen.getByRole("button", { name: "Все" });
    expect(chip.querySelector('[data-slot="filter-chip-pending"]')).not.toBeNull();
    expect(chip.querySelector('[data-slot="filter-chip-check"]')).toBeNull();
  });

  it("квадратная оценка цифрой — без галочки, но с тем же aria-pressed и заливкой", () => {
    render(
      <FilterChip shape="square" selected onClick={() => {}} title="Есть и работает">
        3
      </FilterChip>,
    );
    const chip = screen.getByRole("button", { name: "3" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.querySelector("svg")).toBeNull();
    expect(chip.className).toContain("bg-primary");
    expect(chip.className).toContain("size-11");
  });
});

describe("размер чипа не растёт", () => {
  it("высота — как у Button size=sm: h-7 и text-xs, галочка не выше строки", () => {
    render(
      <FilterChip href="/x" selected>
        Все
      </FilterChip>,
    );
    const chip = screen.getByRole("link", { name: "Все" });
    expect(chip.className).toContain("h-7");
    expect(chip.className).toContain("text-xs");
    expect(chip.className).toContain("size-3.5");
  });
});

describe("SelectionCheck", () => {
  it("круглая галочка выбора скрыта от читалки: состояние говорит aria-pressed на самой карточке", () => {
    const { container } = render(<SelectionCheck />);
    expect(container.querySelector('[data-slot="selection-check"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});
