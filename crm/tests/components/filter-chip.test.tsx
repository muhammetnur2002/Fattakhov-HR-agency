// @vitest-environment jsdom
/**
 * Чип выбора: выбранное видно не только цветом (галочка), и сказано читалке экрана —
 * `aria-current` у ссылки, `aria-pressed` у кнопки, `aria-selected` у вкладки.
 * Раньше у ссылок-фильтров не было ни одного из них.
 *
 * Место под галочку занято у ВСЕХ чипов (решение владельца, 16.10.2026): слот 14 точек перед подписью есть
 * и у невыбранного, и у выбранного, и у ожидающего — выбор не меняет ширину чипа, соседи не двигаются.
 * Раньше галочка появлялась только у выбранного и растила чип на 18 точек (14 + зазор 4).
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
import { FilterChip, FilterChipGroup, SelectionCheck, SelectionSlot } from "@/components/ui/filter-chip";

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

/*
  Высоту чипа здесь не проверяем: в jsdom нет вёрстки, а подстроки `h-7` и `text-xs` в className ничего не
  измеряют (замечание независимой проверки к PR #119). Размер — живой замер рядом с Button size="sm":
  tests/e2e/selection-states.spec.ts, «чип той же высоты и кегля, что Button size=sm».
*/

/**
 * Слот под галочку. В jsdom нет вёрстки, поэтому ширину не меряем — проверяем то, из чего она следует: слот есть у
 * каждого состояния, один и тот же по классам (`size-3.5 shrink-0` — не сжимается и не растёт от содержимого), скрыт от
 * читалки и не содержит ни значка, ни текста у невыбранного. Живой замер ширины и положения соседей до и после
 * выбора — tests/e2e/selection-states.spec.ts, «ширина чипа не меняется при выборе».
 */
describe("FilterChip: слот под галочку занят у всех", () => {
  const slotOf = (chip: HTMLElement) => chip.querySelectorAll('[data-slot="filter-chip-mark"]');

  it("у невыбранной и выбранной ссылки слот один и тот же; у невыбранной он пуст", () => {
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
    expect(slotOf(on)).toHaveLength(1);
    expect(slotOf(off), "у невыбранного чипа слот на месте — иначе выбор меняет ширину").toHaveLength(1);
    const [onSlot, offSlot] = [slotOf(on)[0], slotOf(off)[0]];
    expect(offSlot.className).toBe(onSlot.className);
    for (const cls of ["size-3.5", "shrink-0"]) expect(offSlot.className).toContain(cls);
    // Слот — первый ребёнок, перед подписью: пустое место слева, а не справа
    expect(off.firstElementChild).toBe(offSlot);
    expect(on.firstElementChild).toBe(onSlot);
    // Невыбранный: ни значка, ни текста
    expect(offSlot.querySelector("svg")).toBeNull();
    expect(offSlot.textContent).toBe("");
    // Выбранный: галочка лежит в том же слоте
    expect(onSlot.querySelector('[data-slot="filter-chip-check"]')).not.toBeNull();
  });

  it("слот скрыт от читалки: aria-hidden, не в порядке фокуса, имя чипа — только подпись", () => {
    render(
      <>
        <FilterChip href="/a" selected>
          Месяц
        </FilterChip>
        <FilterChip href="/b" selected={false}>
          Год
        </FilterChip>
      </>,
    );
    for (const name of ["Месяц", "Год"]) {
      const chip = screen.getByRole("link", { name });
      const slot = slotOf(chip)[0];
      expect(slot.getAttribute("aria-hidden"), name).toBe("true");
      expect(slot.querySelector("a, button, input, [tabindex]"), name).toBeNull();
      expect(chip.textContent, `${name}: слот не пишет в текст чипа`).toBe(name);
    }
  });

  it("кнопка и вкладка: слот есть и у выбранной, и у невыбранной", () => {
    render(
      <>
        <FilterChip selected onClick={() => {}}>
          Новые
        </FilterChip>
        <FilterChip selected={false} onClick={() => {}}>
          Приглашены
        </FilterChip>
        <div role="tablist" aria-label="Этапы">
          <FilterChip role="tab" tall selected onClick={() => {}}>
            Скрининг
          </FilterChip>
          <FilterChip role="tab" tall selected={false} onClick={() => {}}>
            Интервью
          </FilterChip>
        </div>
      </>,
    );
    for (const el of [
      screen.getByRole("button", { name: "Новые" }),
      screen.getByRole("button", { name: "Приглашены" }),
      screen.getByRole("tab", { name: "Скрининг" }),
      screen.getByRole("tab", { name: "Интервью" }),
    ]) {
      expect(slotOf(el), el.textContent ?? "").toHaveLength(1);
    }
  });

  it("ожидание занимает тот же слот: спиннер внутри него, чип не растёт", () => {
    link.pending = true;
    render(
      <ListPendingProvider>
        <FilterChip href="/a/clients?status=lead" selected={false}>
          Лиды
        </FilterChip>
      </ListPendingProvider>,
    );
    const chip = screen.getByRole("link", { name: "Лиды" });
    expect(slotOf(chip)).toHaveLength(1);
    expect(slotOf(chip)[0].querySelector('[data-slot="filter-chip-pending"]')).not.toBeNull();
  });

  it("квадратная оценка цифрой слота не имеет: ей галочка не положена", () => {
    render(
      <FilterChip shape="square" selected={false} onClick={() => {}}>
        2
      </FilterChip>,
    );
    expect(slotOf(screen.getByRole("button", { name: "2" }))).toHaveLength(0);
  });
});

describe("SelectionSlot: место под круглую галочку занято и у невыбранной карточки", () => {
  it("выбранная — галочка; невыбранная — пустой слот того же размера, скрытый от читалки", () => {
    const { container, rerender } = render(<SelectionSlot selected />);
    const check = container.querySelector('[data-slot="selection-check"]');
    expect(check).not.toBeNull();
    rerender(<SelectionSlot selected={false} />);
    expect(container.querySelector('[data-slot="selection-check"]')).toBeNull();
    const slot = container.querySelector('[data-slot="selection-slot"]');
    expect(slot, "пустой слот на месте галочки").not.toBeNull();
    expect(slot!.getAttribute("aria-hidden")).toBe("true");
    expect(slot!.className).toContain("size-5");
    expect(slot!.className).toContain("shrink-0");
    expect(check!.className).toContain("size-5");
  });
});

describe("SelectionCheck", () => {
  it("круглая галочка выбора скрыта от читалки: состояние говорит aria-pressed на самой карточке", () => {
    const { container } = render(<SelectionCheck />);
    expect(container.querySelector('[data-slot="selection-check"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});
