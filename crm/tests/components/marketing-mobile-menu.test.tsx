// @vitest-environment jsdom
/**
 * Меню сайта на телефоне и планшете.
 *
 * До него разделы в шапке уже 1280 px просто прятались, и открыть их
 * было нечем: с внутренней страницы до «Тарифов» или «Кейсов» не было
 * пути вовсе. Тест держит три вещи: в шторке все разделы сайта из того
 * же списка, что и в широкой шапке; в ней есть то, что ушло из узкой
 * шапки, — телефон и вход; переход по пункту закрывает шторку.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// next/link без роутера приложения в jsdom не живёт, а логотип тянет
// next/image с его загрузчиком — проверяем меню, а не их
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        rest.onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/brand/logo", () => ({
  Logo: () => <span>Fattakhov HR</span>,
}));

import { MarketingMobileMenu } from "@/components/marketing/mobile-menu";
import { MARKETING_LINKS } from "@/lib/marketing/nav";

function renderMenu(studentsHref: string | null = null) {
  render(
    <MarketingMobileMenu
      phoneHref="tel:+79375711877"
      phoneDisplay="+7 (937) 571-18-77"
      loginHref="https://my.fattakhovhr.ru/login"
      registerHref="https://my.fattakhovhr.ru/register"
      studentsHref={studentsHref}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
  return screen.getByRole("dialog");
}

describe("меню сайта на узком экране", () => {
  it("в шторке все разделы — из того же списка, что и в широкой шапке", () => {
    const dialog = renderMenu();
    for (const link of MARKETING_LINKS) {
      const a = [...dialog.querySelectorAll("a")].find(
        (el) => el.textContent?.trim() === link.label,
      );
      expect(a, `нет пункта «${link.label}»`).toBeDefined();
      expect(a).toHaveAttribute("href", link.href);
    }
  });

  it("есть то, что ушло из узкой шапки: телефон целиком и вход", () => {
    const dialog = renderMenu();
    const phone = [...dialog.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("+7 (937) 571-18-77"),
    );
    expect(phone).toHaveAttribute("href", "tel:+79375711877");

    const login = [...dialog.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Войти в кабинет",
    );
    expect(login).toHaveAttribute("href", "https://my.fattakhovhr.ru/login");
  });

  it("переход по пункту закрывает шторку", async () => {
    const dialog = renderMenu();
    const tariffs = [...dialog.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Тарифы",
    )!;

    fireEvent.click(tariffs);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("у шторки есть заголовок для экранных читалок", () => {
    const dialog = renderMenu();
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
  });
});

describe("«Обсудить найм» в меню", () => {
  it("ведёт туда, куда передала шапка, — на регистрацию в кабинете", () => {
    const menu = renderMenu();
    const link = within(menu).getByRole("link", { name: "Обсудить найм" });
    expect(link.getAttribute("href")).toBe("https://my.fattakhovhr.ru/register");
  });
});

describe("«Обсудить найм» в шапке сайта", () => {
  // Решение владельца (21.09.2026, подтверждено 04.10.2026): кнопка ведёт
  // на регистрацию компании, а форма «перезвоните мне» остаётся на главной
  // для тех, кто не готов заводить кабинет. Шапка — серверный компонент,
  // адрес берёт из окружения, поэтому проверяется её исходник
  it("и кнопка, и меню ведут на регистрацию, а не к форме на главной", () => {
    const header = readFileSync("components/marketing/header.tsx", "utf8");
    expect(header).toMatch(/<a href=\{appUrl\("\/register"\)\}>/);
    expect(header).toMatch(/registerHref=\{appUrl\("\/register"\)\}/);
    expect(header).not.toMatch(/"\/#diagnostic"/);
  });
});

describe("«Студентам» в меню", () => {
  it("ведёт на студенческую платформу, когда её адрес задан", () => {
    const menu = renderMenu("https://students.example.ru/");
    const link = within(menu).getByRole("link", { name: "Студентам" });
    expect(link.getAttribute("href")).toBe("https://students.example.ru/");
  });

  it("без адреса пункта нет — кнопка в никуда хуже отсутствующей", () => {
    const menu = renderMenu(null);
    expect(within(menu).queryByRole("link", { name: "Студентам" })).toBeNull();
  });
});
