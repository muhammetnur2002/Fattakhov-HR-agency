// @vitest-environment jsdom
/**
 * Нижняя панель разделов на телефоне (components/shell/bottom-tabs.tsx).
 *
 * Раскладку и жесты держит e2e (tests/e2e/mobile-shell.spec.ts), здесь —
 * состав: четыре вкладки из `mobileTab`, «Ещё» со всем остальным без
 * повторов, и замок у разделов, закрытых до договора. Последнее в e2e
 * не проверить: в тестовых данных нет учётки клиента без договора.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { BottomTabs } from "@/components/shell/bottom-tabs";
import { CLIENT_NAV, type NavItem } from "@/lib/nav";

function renderTabs(items: NavItem[]) {
  return render(
    <BottomTabs items={items} title="Старфиш" roleLabel="Администратор" siteHref="https://example.test" />,
  );
}

describe("нижняя панель разделов", () => {
  it("четыре вкладки и «Ещё», в шторке — только остальное", async () => {
    nav.pathname = "/dashboard";
    renderTabs(CLIENT_NAV);

    const bar = screen.getByRole("navigation", { name: "Разделы" });
    const tabs = within(bar).getAllByRole("link").map((a) => a.textContent?.trim());
    expect(tabs).toEqual(["Дашборд", "Вакансии", "Кандидаты", "Сообщения"]);
    expect(within(bar).getByRole("link", { name: "Дашборд" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(within(bar).getByRole("button", { name: "Ещё" }));
    const sheet = await screen.findByRole("dialog");
    const rest = within(sheet)
      .getAllByRole("link")
      .map((a) => a.textContent?.trim());
    for (const tab of tabs) expect(rest).not.toContain(tab);
    expect(rest).toContain("Календарь");
    expect(rest).toContain("На сайт");
  });

  it("не больше четырёх вкладок, даже если отмечено больше", () => {
    const items = CLIENT_NAV.map((i) => ({ ...i, mobileTab: true }));
    renderTabs(items);
    const bar = screen.getByRole("navigation", { name: "Разделы" });
    expect(within(bar).getAllByRole("link")).toHaveLength(4);
  });

  it("раздел до договора — с замком, как в боковом меню", async () => {
    // Так AppShell размечает меню клиента без договора (lib/contract-gate.ts)
    const locked = new Set(["/vacancies", "/candidates", "/calendar", "/analytics", "/messages"]);
    const items = CLIENT_NAV.map((i) => (locked.has(i.href) ? { ...i, locked: true } : i));
    renderTabs(items);

    const bar = screen.getByRole("navigation", { name: "Разделы" });
    expect(within(bar).getAllByLabelText("Откроется после договора")).toHaveLength(3);
    expect(
      within(within(bar).getByRole("link", { name: /Дашборд/ })).queryByLabelText("Откроется после договора"),
    ).toBeNull();

    await userEvent.click(within(bar).getByRole("button", { name: "Ещё" }));
    const sheet = await screen.findByRole("dialog");
    // В шторке закрыты календарь и аналитика, документы — нет
    expect(within(sheet).getAllByLabelText("Откроется после договора")).toHaveLength(2);
  });

  it("«Ещё» подсвечен, когда открыт раздел из шторки", async () => {
    nav.pathname = "/calendar";
    renderTabs(CLIENT_NAV);
    const bar = screen.getByRole("navigation", { name: "Разделы" });
    for (const link of within(bar).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
    await userEvent.click(within(bar).getByRole("button", { name: "Ещё" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("link", { name: /Календарь/ })).toHaveAttribute("aria-current", "page");
  });
});
