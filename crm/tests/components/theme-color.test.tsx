// @vitest-environment jsdom
/**
 * Полоса браузера (meta theme-color) следует за переключателем темы.
 *
 * Next.js рисует два тега с media по теме системы. Переключатель темы в
 * интерфейсе работает отдельно от системы: на тёмном телефоне выбираешь
 * «светлую», страница светлая, а полоса адреса оставалась чёрной.
 */
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/components/shell/theme-provider";
import { THEME_COLOR_OVERRIDE_ID, THEME_COLOR_SCRIPT, THEME_COLORS } from "@/lib/theme-color";

function installMetas() {
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">
  `;
}

/** Теги Next: с media. Тег-перебивка (без media) — наш. */
const nextMetas = () =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')];
const override = () => document.getElementById(THEME_COLOR_OVERRIDE_ID) as HTMLMetaElement | null;

/**
 * Цвет, который выберет браузер: первый тег, у которого нет media или оно подходит.
 * Системная тема в тесте задаётся аргументом.
 */
function effective(systemDark: boolean): string | null {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute("media");
    if (!media || media.includes(systemDark ? "dark" : "light")) return meta.getAttribute("content");
  }
  return null;
}

function runScript() {
  new Function("window", "document", THEME_COLOR_SCRIPT)(window, document);
}

beforeEach(() => {
  // jsdom не знает matchMedia; система светлая — как у большинства
  vi.stubGlobal(
    "matchMedia",
    () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  );
  window.localStorage.removeItem("theme");
  installMetas();
  delete window.__applyThemeColor;
  runScript();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.head.innerHTML = "";
  delete window.__applyThemeColor;
});

describe("meta theme-color", () => {
  it("«как в системе»: перебивки нет, каждый тег Next на месте — полосой правит система", () => {
    window.__applyThemeColor!("system");
    expect(override()).toBeNull();
    expect(effective(false)).toBe(THEME_COLORS.light);
    expect(effective(true)).toBe(THEME_COLORS.dark);
  });

  it("ручной выбор тёмной темы: на тёмной и на светлой системе полоса тёмная", () => {
    window.__applyThemeColor!("dark");
    expect(effective(false)).toBe(THEME_COLORS.dark);
    expect(effective(true)).toBe(THEME_COLORS.dark);
  });

  it("ручной выбор светлой темы: даже на тёмной системе полоса светлая", () => {
    window.__applyThemeColor!("light");
    expect(effective(true)).toBe(THEME_COLORS.light);
    expect(effective(false)).toBe(THEME_COLORS.light);
  });

  it("возврат к «как в системе» убирает перебивку", () => {
    window.__applyThemeColor!("light");
    window.__applyThemeColor!("system");
    expect(override()).toBeNull();
    expect(effective(true)).toBe(THEME_COLORS.dark);
  });

  it("повторный выбор не плодит теги: перебивка всегда одна и первая в <head>", () => {
    window.__applyThemeColor!("dark");
    window.__applyThemeColor!("light");
    window.__applyThemeColor!("dark");
    expect(document.querySelectorAll("#theme-color-override")).toHaveLength(1);
    expect(document.head.firstElementChild).toBe(override());
    expect(override()!.hasAttribute("media")).toBe(false);
  });

  it("теги Next не изменены: React узнаёт их при гидратации по содержимому", () => {
    window.__applyThemeColor!("light");
    expect(nextMetas().map((m) => m.getAttribute("content"))).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });

  it("Next пересоздал свои теги при переходе — выбор не теряется", () => {
    window.__applyThemeColor!("dark");
    for (const meta of nextMetas()) meta.remove();
    document.head.insertAdjacentHTML(
      "beforeend",
      `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
       <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`,
    );
    expect(effective(false)).toBe(THEME_COLORS.dark);
  });
});

describe("ThemeProvider передаёт выбор полосе", () => {
  function Switch({ to }: { to: "light" | "dark" | "system" }) {
    const { setTheme } = useTheme();
    return (
      <button type="button" onClick={() => setTheme(to)}>
        {to}
      </button>
    );
  }

  it("переключение темы в интерфейсе перекрашивает полосу на любой системе", () => {
    window.localStorage.removeItem("theme");
    const { getByText } = render(
      <ThemeProvider>
        <Switch to="dark" />
      </ThemeProvider>,
    );

    act(() => getByText("dark").click());
    expect(effective(false)).toBe(THEME_COLORS.dark);
    expect(effective(true)).toBe(THEME_COLORS.dark);
  });

  it("выбор «светлая» даёт светлую полосу и на тёмной системе", () => {
    const { getByText } = render(
      <ThemeProvider>
        <Switch to="light" />
      </ThemeProvider>,
    );

    act(() => getByText("light").click());
    expect(effective(true)).toBe(THEME_COLORS.light);
    expect(effective(false)).toBe(THEME_COLORS.light);
  });
});

describe("цвета совпадают со страницей", () => {
  const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

  function hexOf(rgb: string): string {
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }

  it("светлая — фон светлой темы, тёмная — фон тёмной", () => {
    const light = css.match(/^\s{2}--background:\s*(rgb\([^)]*\))/m)![1];
    const dark = css.match(/\.dark\s*\{[^}]*?--background:\s*(rgb\([^)]*\))/)?.[1];
    expect(hexOf(light)).toBe(THEME_COLORS.light);
    expect(dark ? hexOf(dark) : null).toBe(THEME_COLORS.dark);
  });

  it("корневой макет берёт цвета из THEME_COLORS и подключает скрипт до скрипта темы", () => {
    const layout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain("THEME_COLORS.light");
    expect(layout).toContain("THEME_COLORS.dark");
    expect(layout.indexOf("THEME_COLOR_SCRIPT }}")).toBeLessThan(layout.indexOf("NO_FLASH_SCRIPT }}"));
  });
});
