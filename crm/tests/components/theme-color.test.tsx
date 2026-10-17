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
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/components/shell/theme-provider";
import {
  OVERRIDE_COLORS,
  THEME_COLOR_OVERRIDE_ID,
  THEME_COLOR_SCRIPT,
  THEME_COLORS,
} from "@/lib/theme-color";

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

/** Цвет в одной записи: «#EEE» и «#eee» — тот же, что «#eeeeee». Так его видит браузер. */
function canonical(hex: string | null): string | null {
  if (hex === null) return null;
  const h = hex.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(h) ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h;
}

/**
 * Цвет, который выберет браузер: первый тег, у которого нет media или оно подходит.
 * Системная тема в тесте задаётся аргументом. Запись цвета (регистр, короткая форма)
 * браузеру безразлична, поэтому сравниваем цвет, а не строку.
 */
function effective(systemDark: boolean): string | null {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute("media");
    if (!media || media.includes(systemDark ? "dark" : "light")) return canonical(meta.getAttribute("content"));
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

/**
 * React забирает себе чужой тег, если у него совпали name и content (media и id он не
 * сверяет), — и тогда перебивка пропадает из документа, а переход по ссылке обрывается
 * с TypeError (замер на Next 16.3.8 и 16.4.0, нижняя панель разделов не переключала
 * раздел). Поэтому запись цвета у перебивки обязана отличаться от записи у Next.
 */
describe("перебивку не забирает React", () => {
  it("цвета перебивки — те же, что у страницы", () => {
    expect(canonical(OVERRIDE_COLORS.light)).toBe(THEME_COLORS.light);
    expect(canonical(OVERRIDE_COLORS.dark)).toBe(THEME_COLORS.dark);
  });

  it("но записаны не так, как у тегов Next: строка не совпадает ни с одной", () => {
    const nextContents: string[] = Object.values(THEME_COLORS);
    for (const color of Object.values(OVERRIDE_COLORS)) {
      expect(nextContents).not.toContain(color);
    }
  });

  for (const mode of ["light", "dark"] as const) {
    it(`гидратация страницы: перебивка «${mode}» остаётся в <head> одним тегом, React её не берёт`, async () => {
      const act_ = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      const previous = act_.IS_REACT_ACT_ENVIRONMENT;
      act_.IS_REACT_ACT_ENVIRONMENT = true;
      // Страница, как её отдал сервер: два тега Next в <head>; скрипт темы уже поставил перебивку
      // (он стоит в разметке и срабатывает до гидратации)
      document.head.innerHTML = "";
      installMetas();
      window.__applyThemeColor!(mode);
      const mine = override()!;
      expect(mine).not.toBeNull();

      // Next гидратирует документ целиком, теги в <head> — hoistable-элементы: React ищет среди
      // <meta> документа готовый с тем же name и content и забирает его себе
      const errors: unknown[] = [];
      let root!: ReturnType<typeof hydrateRoot>;
      try {
        await act(async () => {
          // <head> через createElement: правило next/no-head-element относится к страницам, не к тесту
          const head = createElement(
            "head",
            null,
            <meta name="theme-color" media="(prefers-color-scheme: light)" content={THEME_COLORS.light} />,
            <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLORS.dark} />,
          );
          root = hydrateRoot(
            document,
            <html>
              {head}
              <body />
            </html>,
            { onRecoverableError: (e) => errors.push(e) },
          );
        });

        expect(override(), "перебивка на месте и та же").toBe(mine);
        expect(document.querySelectorAll('meta[name="theme-color"]'), "два тега Next и наш").toHaveLength(3);
        expect(mine.hasAttribute("media"), "React не навесил на неё чужое media").toBe(false);
        expect(
          Object.keys(mine).filter((k) => k.startsWith("__react")),
          "React не пометил перебивку своей",
        ).toEqual([]);
        expect(document.head.firstElementChild).toBe(mine);
        expect(errors).toEqual([]);
      } finally {
        await act(async () => root?.unmount());
        act_.IS_REACT_ACT_ENVIRONMENT = previous;
      }
    });
  }
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
