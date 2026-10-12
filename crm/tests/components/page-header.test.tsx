// @vitest-environment jsdom
/**
 * Шапка страницы: заголовок, подпись, действия справа.
 *
 * Сверка по скриншоту воронки студплатформы: левый блок шапки не умел сжиматься,
 * и на ноутбуке в 1280 кнопка «Все клиенты» уходила отдельной строкой под длинную
 * подпись, слева, а не справа от заголовка, как на соседних страницах.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader", () => {
  it("заголовок — единственный h1, подпись под ним, действия отдельным блоком", () => {
    const { container } = render(
      <PageHeader title="Воронка" description="Длинная подпись" actions={<button type="button">Все клиенты</button>} />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Воронка");
    const header = container.querySelector('[data-slot="page-header"]')!;
    expect(header.children).toHaveLength(2);
    expect(header.children[0].textContent).toBe("ВоронкаДлинная подпись");
    expect(header.children[1].textContent).toBe("Все клиенты");
  });

  it("левый блок сжимается и забирает свободное место — подпись переносится сама", () => {
    const { container } = render(<PageHeader title="Воронка" description="Подпись" actions={<button type="button">Действие</button>} />);
    const left = container.querySelector('[data-slot="page-header"]')!.children[0];
    const classes = left.className.split(/\s+/);
    expect(classes).toContain("min-w-0");
    expect(classes).toContain("flex-1");
  });

  it("без подписи и действий — только заголовок", () => {
    const { container } = render(<PageHeader title="Только заголовок" />);
    const header = container.querySelector('[data-slot="page-header"]')!;
    expect(header.children).toHaveLength(1);
    expect(header.querySelector("p")).toBeNull();
  });
});
