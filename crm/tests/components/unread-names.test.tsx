// @vitest-environment jsdom
/**
 * Счётчик непрочитанного не сливается с названием ссылки.
 *
 * Кружок лежит внутри ссылки, и читалка экрана склеивала его с названием:
 * «Сообщения3», «3Сообщения». Теперь имя ссылки — «Сообщения, непрочитанных: 3»,
 * а сам кружок скрыт от читалки, чтобы число не прозвучало дважды.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { StudentsTabs } from "@/app/(client)/students/students-tabs";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { IconRail } from "@/components/shell/icon-rail";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { CountBadge } from "@/components/ui/count-badge";
import { CLIENT_NAV, navLinkLabel, type NavItem } from "@/lib/nav";

const withBadge = (n: number): NavItem[] =>
  CLIENT_NAV.map((i) => (i.href === "/messages" ? { ...i, badge: n } : i));

describe("CountBadge с подписью", () => {
  it("читалка слышит «, непрочитанных: 3» после названия, а не склеенное «Сообщения3»", () => {
    render(
      <a href="#messages">
        Сообщения
        <CountBadge count={3} label="непрочитанных" />
      </a>,
    );
    expect(screen.getByRole("link", { name: "Сообщения, непрочитанных: 3" })).toBeTruthy();
  });

  it("от десяти на кружке «9+», но читалке называется точное число", () => {
    render(
      <a href="#messages">
        Сообщения
        <CountBadge count={14} label="непрочитанных" />
      </a>,
    );
    const link = screen.getByRole("link", { name: "Сообщения, непрочитанных: 14" });
    expect(link).toHaveTextContent("9+");
  });

  it("без подписи — по-прежнему просто число", () => {
    render(<CountBadge count={3} />);
    expect(screen.getByText("3")).toBeTruthy();
  });
});

describe("navLinkLabel", () => {
  it("есть счётчик — имя с ним, нет — undefined и имя берётся из текста ссылки", () => {
    expect(navLinkLabel({ label: "Сообщения", badge: 3 })).toBe("Сообщения, непрочитанных: 3");
    expect(navLinkLabel({ label: "Сообщения", badge: 0 })).toBeUndefined();
    expect(navLinkLabel({ label: "Сообщения" })).toBeUndefined();
  });
});

describe("панели разделов", () => {
  it("боковое меню: имя ссылки с числом, список подписан «Разделы»", () => {
    render(<SidebarNav items={withBadge(3)} />);
    const bar = screen.getByRole("navigation", { name: "Разделы" });
    expect(within(bar).getByRole("link", { name: "Сообщения, непрочитанных: 3" })).toBeTruthy();
    expect(within(bar).getByRole("link", { name: "Дашборд" })).toBeTruthy();
  });

  it("панель иконок на планшете: то же имя, а не короткая подпись под значком", () => {
    render(<IconRail items={withBadge(3)} siteHref="https://example.test" />);
    expect(screen.getByRole("link", { name: "Сообщения, непрочитанных: 3" })).toBeTruthy();
  });

  it("нижняя панель на телефоне: вкладка и плитка в «Ещё» — с числом в имени", () => {
    render(<BottomTabs items={withBadge(3)} title="Старфиш" roleLabel="Администратор" siteHref="https://example.test" />);
    const bar = screen.getByRole("navigation", { name: "Разделы" });
    expect(within(bar).getByRole("link", { name: "Сообщения, непрочитанных: 3" })).toBeTruthy();
  });

  it("без непрочитанного имя ссылки — только название", () => {
    render(<SidebarNav items={withBadge(0)} />);
    expect(screen.getByRole("link", { name: "Сообщения" })).toBeTruthy();
  });
});

describe("вкладки студенческой платформы", () => {
  it("подписаны как отдельный список разделов, числа — с пояснением", () => {
    nav.pathname = "/students";
    render(<StudentsTabs newApplications={2} unreadMessages={5} />);
    const tabs = screen.getByRole("navigation", { name: "Студенческая платформа" });
    expect(within(tabs).getByRole("link", { name: "Отклики, новых: 2" })).toBeTruthy();
    expect(within(tabs).getByRole("link", { name: "Сообщения, непрочитанных: 5" })).toBeTruthy();
    expect(within(tabs).getByRole("link", { name: "Вакансии" })).toBeTruthy();
  });
});
