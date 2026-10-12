// @vitest-environment jsdom
/**
 * Кнопки разбора заявки: основная слева и крупнее, «Спам» тихая и отодвинута.
 *
 * Заказчица просила «переставить кнопки "Взять в работу" / "Спам" ради удобства».
 * Решение: основное действие первым и залито цветом, отказ — с рамкой, у правого
 * края (ml-auto) и не вплотную к основной, чтобы не нажать «Спам» вместо «Взять
 * в работу» по привычке. Здесь — порядок, вид и расстояние в разметке; саму
 * раскладку в браузере меряет tests/e2e/leads-layout.spec.ts.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(agency)/a/leads/actions", () => ({ setLeadStatusAction: vi.fn() }));

import { LeadActions } from "@/app/(agency)/a/leads/lead-actions";

function buttons(status: string) {
  render(<LeadActions leadId="l1" status={status} />);
  return screen.getAllByRole("button");
}

describe("LeadActions", () => {
  it("новая: «Взять в работу» первая и залита, «Спам» вторая — с рамкой и справа", () => {
    const [primary, quiet] = buttons("NEW");
    expect(primary.textContent).toBe("Взять в работу");
    expect(quiet.textContent).toBe("Спам");
    expect(primary.getAttribute("data-variant")).toBe("default");
    expect(quiet.getAttribute("data-variant")).toBe("outline");
    expect(quiet.className.split(/\s+/)).toContain("sm:ml-auto");
    expect(primary.className.split(/\s+/)).not.toContain("sm:ml-auto");
  });

  it("в работе: «Стал клиентом» основная, «Не сложилось» тихая и справа", () => {
    const [primary, quiet] = buttons("IN_PROGRESS");
    expect(primary.textContent).toBe("Стал клиентом");
    expect(primary.getAttribute("data-variant")).toBe("default");
    expect(quiet.textContent).toBe("Не сложилось");
    expect(quiet.className.split(/\s+/)).toContain("sm:ml-auto");
  });

  it("закрытая: одна кнопка «Вернуть в новые», слева", () => {
    const list = buttons("SPAM");
    expect(list).toHaveLength(1);
    expect(list[0].textContent).toBe("Вернуть в новые");
    expect(list[0].className.split(/\s+/)).not.toContain("sm:ml-auto");
  });

  it("на телефоне кнопки в столбик на всю ширину: основная первая", () => {
    const [primary, quiet] = buttons("NEW");
    for (const b of [primary, quiet]) expect(b.className.split(/\s+/)).toContain("w-full");
    const form = primary.closest("form")!;
    expect(form.className.split(/\s+/)).toContain("flex-col");
    expect(form.className.split(/\s+/)).toContain("sm:flex-row");
  });
});
