// @vitest-environment jsdom
/**
 * «Перейти к содержимому»: якорь на main, который принимает фокус.
 *
 * Переход фокуса по Tab и Enter — в браузере: tests/e2e/skip-link.spec.ts.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "@/components/shell/skip-link";
import { MAIN_CONTENT_ID, MAIN_LANDMARK_PROPS } from "@/lib/a11y";

describe("ссылка «Перейти к содержимому»", () => {
  it("ведёт на якорь основного содержимого", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Перейти к содержимому" });
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(link).toHaveClass("skip-link");
  });

  it("плашка встаёт ниже липкой шапки оболочки: отступ задаётся токеном, а не числом", () => {
    render(<SkipLink below="var(--cabinet-header-h)" />);
    const link = screen.getByRole("link", { name: "Перейти к содержимому" });
    expect(link.style.getPropertyValue("--skip-link-top")).toBe("calc(var(--cabinet-header-h) + 0.5rem)");
  });

  it("main принимает фокус программно, но в порядок Tab не входит", () => {
    expect(MAIN_LANDMARK_PROPS).toEqual({ id: MAIN_CONTENT_ID, tabIndex: -1 });
  });
});
