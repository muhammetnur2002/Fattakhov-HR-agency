// @vitest-environment jsdom
/**
 * Ссылка «назад» сжимается, а не выталкивает соседа.
 *
 * Сверка 08.10.2026: базовая кнопка несёт shrink-0 и whitespace-nowrap, а у BackLink был один
 * min-w-0 — длинное название вакансии выталкивало кнопку печати за экран на 375px.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BackLink } from "@/components/ui/back-link";

describe("BackLink", () => {
  it("класс ссылки разрешает сжатие: shrink без shrink-0, max-w-full и min-w-0", () => {
    render(<BackLink href="/vacancies">№12 Очень длинное название вакансии, которое не помещается в строку</BackLink>);
    const link = screen.getByRole("link");
    const classes = link.className.split(/\s+/);
    expect(classes).toContain("shrink");
    expect(classes).not.toContain("shrink-0");
    expect(classes).toContain("max-w-full");
    expect(classes).toContain("min-w-0");
  });
});
