// @vitest-environment jsdom
/**
 * Плашка «Обновите браузер».
 *
 * Safari ниже 16.4 не разбирает пакет скриптов (регулярные выражения с
 * просмотром назад — синтаксическая ошибка), и человек раньше видел
 * страницу без работающих кнопок и без объяснения. Плашку открывает
 * маленький скрипт, вписанный в разметку, по возможностям браузера (не по
 * User-Agent). Тест выполняет тот же текст скрипта на подменённом «окне».
 */
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UnsupportedBrowserNotice } from "@/components/shell/unsupported-browser-notice";
import { BROWSER_SUPPORT_BODY, BROWSER_SUPPORT_SCRIPT } from "@/lib/browser-support";

type FakeWindow = {
  RegExp: unknown;
  CSS: unknown;
  structuredClone: unknown;
  sessionStorage: Storage;
};

/** Современный браузер: всё есть. */
function modernWindow(overrides: Partial<FakeWindow> = {}): FakeWindow {
  return {
    RegExp,
    CSS: { supports: () => true },
    structuredClone: () => {},
    sessionStorage: window.sessionStorage,
    ...overrides,
  };
}

/** Safari 16.3: регулярное выражение с просмотром назад — синтаксическая ошибка. */
class OldRegExp {
  constructor(pattern: string) {
    if (/\(\?<[=!]/.test(pattern)) throw new SyntaxError("Invalid regular expression: invalid group specifier name");
  }
}

function run(fake: FakeWindow) {
  new Function("w", "d", BROWSER_SUPPORT_BODY)(fake, document);
}

const box = () => document.getElementById("browser-notice") as HTMLElement;
/** Причины, которые сейчас видны человеку: открытые скриптом пункты списка. */
const shownReasons = () =>
  [...document.querySelectorAll<HTMLElement>("[data-missing]")]
    .filter((el) => !el.hasAttribute("hidden"))
    .map((el) => el.textContent ?? "");

beforeEach(() => {
  window.sessionStorage.clear();
  render(<UnsupportedBrowserNotice />);
});
afterEach(cleanup);

describe("разметка с сервера", () => {
  it("скрыта по умолчанию: поддерживаемые браузеры плашку не видят", () => {
    expect(box().hasAttribute("hidden")).toBe(true);
  });

  it("серверный рендер не падает и отдаёт скрытую плашку со скриптом", () => {
    const html = renderToString(<UnsupportedBrowserNotice />);
    expect(html).toContain('id="browser-notice"');
    expect(html).toMatch(/id="browser-notice"[^>]*hidden/);
    expect(html).toContain("Обновите браузер");
    // Скрипт вписан в разметку: основной пакет в старом Safari не запустится
    expect(html).toContain("<script");
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
  });

  it("плашка — отдельная область с названием, чтобы читалка её находила", () => {
    expect(box().getAttribute("role")).toBe("region");
    expect(box().getAttribute("aria-label")).toBe("Устаревший браузер");
  });
});

describe("проверка по возможностям", () => {
  it("Safari 16.3 (нет lookbehind): плашка открыта, причина названа", () => {
    run(modernWindow({ RegExp: OldRegExp }));

    expect(box().hasAttribute("hidden")).toBe(false);
    expect(shownReasons()).toHaveLength(1);
    expect(shownReasons()[0]).toContain("регулярные выражения с просмотром назад");
    expect(shownReasons()[0]).toContain("Safari 16.4");
  });

  it("нет color-mix: причина — цвета CSS", () => {
    run(modernWindow({ CSS: { supports: () => false } }));

    expect(box().hasAttribute("hidden")).toBe(false);
    expect(shownReasons()).toEqual([expect.stringContaining("color-mix")]);
  });

  it("нет CSS.supports вовсе или structuredClone — тоже неподдерживаемый", () => {
    run(modernWindow({ CSS: undefined, structuredClone: undefined }));

    expect(box().hasAttribute("hidden")).toBe(false);
    const reasons = shownReasons().join(" | ");
    expect(reasons).toContain("color-mix");
    expect(reasons).toContain("structuredClone");
    expect(reasons).not.toContain("регулярные выражения");
  });

  it("современный браузер: плашка остаётся скрытой", () => {
    run(modernWindow());
    expect(box().hasAttribute("hidden")).toBe(true);
  });

  it("исключение внутри проверки не ломает страницу", () => {
    const hostile = modernWindow({
      CSS: {
        supports: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => run(hostile)).not.toThrow();
  });

  it("«Понятно» закрывает плашку и помнит выбор до конца сеанса", () => {
    run(modernWindow({ RegExp: OldRegExp }));
    (document.getElementById("browser-notice-close") as HTMLButtonElement).click();

    expect(box().hasAttribute("hidden")).toBe(true);
    expect(window.sessionStorage.getItem("browser-notice-closed")).toBe("1");

    // Следующая страница сеанса: тот же браузер, плашка не возвращается
    cleanup();
    render(<UnsupportedBrowserNotice />);
    run(modernWindow({ RegExp: OldRegExp }));
    expect(box().hasAttribute("hidden")).toBe(true);
  });
});

describe("сам скрипт", () => {
  it("не смотрит на User-Agent", () => {
    expect(BROWSER_SUPPORT_SCRIPT).not.toMatch(/userAgent|navigator\./i);
  });

  it("написан на ES5: он обязан разобраться там, где пакет не разобрался", () => {
    // Стрелки, let/const, шаблонные строки, ?. и ?? в старом Safari — та же синтаксическая ошибка
    expect(BROWSER_SUPPORT_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  });

  it("подключён в корневом макете, а не в одном из кабинетов", () => {
    const layout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain("<UnsupportedBrowserNotice />");
  });
});
