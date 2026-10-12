// @vitest-environment jsdom
/**
 * Широкая таблица в рамке с прокруткой доступна с клавиатуры.
 *
 * Контейнер с overflow-x-auto без фокуса не прокрутить стрелками: правые
 * столбцы недосягаемы. Фокус (tabIndex=0) и роль «область» с именем появляются
 * только когда содержимое действительно шире рамки — иначе на телефоне, где
 * таблицы раскладываются блоками, остался бы пустой пункт в порядке Tab.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollRegion } from "@/components/ui/scroll-region";

type Observer = { callback: () => void };
const observers: Observer[] = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observers.push({ callback });
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom не считает раскладку: ширины подставляем сами. */
function widths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

const table = (
  <ScrollRegion label="Категории и цели" className="md:overflow-x-auto" data-testid="wrap">
    <table>
      <caption>Категории</caption>
      <tbody>
        <tr>
          <td>Кандидаты</td>
        </tr>
      </tbody>
    </table>
  </ScrollRegion>
);

describe("ScrollRegion", () => {
  it("содержимое шире рамки: область с именем, в порядке Tab", () => {
    widths(900, 400);
    render(table);

    const region = screen.getByRole("region", { name: "Категории и цели" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("md:overflow-x-auto");
  });

  it("всё помещается: ни фокуса, ни роли — пустого пункта Tab нет", () => {
    widths(400, 400);
    render(table);

    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByTestId("wrap")).not.toHaveAttribute("tabindex");
  });

  it("окно сузили — фокус появляется, расширили — исчезает", () => {
    widths(400, 400);
    render(table);
    expect(screen.queryByRole("region")).toBeNull();

    widths(900, 400);
    act(() => observers.forEach((o) => o.callback()));
    expect(screen.getByRole("region", { name: "Категории и цели" })).toHaveAttribute("tabindex", "0");

    widths(400, 400);
    act(() => observers.forEach((o) => o.callback()));
    expect(screen.queryByRole("region")).toBeNull();
  });
});
