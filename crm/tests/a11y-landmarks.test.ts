/**
 * Ориентиры страницы и доступность с клавиатуры — защита от возврата (проверка 11.10.2026).
 *
 * Нашли: на публичных страницах не было ни main, ни подвала, безымянные <nav> нельзя было
 * различить в списке ориентиров, мимо шапки приходилось пролистывать 8–19 нажатий Tab, а липкие
 * шапки закрывали элемент с фокусом. Здесь — правила по исходникам; как они работают на живых
 * страницах, проверяют tests/e2e/a11y-landmarks.spec.ts, skip-link.spec.ts, focus-not-covered.spec.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const readCode = (file: string) => stripComments(read(file));

/** Без комментариев: в пояснениях тоже пишут «<main>» и «<nav>», это не разметка. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

function tsx(dir: string): { file: string; text: string }[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((rel) => rel.endsWith(".tsx"))
    .map((rel) => ({ file: join(dir, rel), text: stripComments(readFileSync(join(ROOT, dir, rel), "utf8")) }));
}

const ALL = [...tsx("app"), ...tsx("components")];

/** Открывающие теги <name …> целиком: > внутри {…} и кавычек (стрелки =>) тег не закрывает. */
function openingTags(text: string, name: string): string[] {
  const tags: string[] = [];
  const start = new RegExp(`<${name}(?=[\\s>/])`, "g");
  for (let m = start.exec(text); m; m = start.exec(text)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(text.slice(m.index, i + 1));
  }
  return tags;
}

describe("ориентиры", () => {
  it("каждый <nav> подписан: безымянных ориентиров навигации нет", () => {
    const bad = ALL.flatMap(({ file, text }) =>
      openingTags(text, "nav")
        .filter((tag) => !/\baria-label(ledby)?=/.test(tag))
        .map((tag) => `${file}: ${tag.replace(/\s+/g, " ").slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });

  it("<main> несёт якорь ссылки «Перейти к содержимому» (MAIN_LANDMARK_PROPS)", () => {
    const bad = ALL.filter(({ file }) => file !== "app/global-error.tsx").flatMap(({ file, text }) =>
      openingTags(text, "main")
        .filter((tag) => !tag.includes("MAIN_LANDMARK_PROPS"))
        .map(() => file),
    );
    expect(bad).toEqual([]);
  });

  it("у каждой оболочки с main есть ссылка «Перейти к содержимому»", () => {
    for (const file of [
      "components/shell/app-shell.tsx",
      "app/(public)/layout.tsx",
      "app/(marketing)/layout.tsx",
      "app/(onboarding)/layout.tsx",
    ]) {
      const text = readCode(file);
      expect(text, file).toContain("<SkipLink");
      expect(openingTags(text, "main"), file).toHaveLength(1);
    }
  });

  it("публичные страницы: шапка, единственный main и подвал", () => {
    const layout = readCode("app/(public)/layout.tsx");
    expect(openingTags(layout, "header")).toHaveLength(1);
    expect(openingTags(layout, "main")).toHaveLength(1);
    expect(openingTags(layout, "footer")).toHaveLength(1);
  });

  it("страницы, которые рисуются без оболочки, несут свой main", () => {
    // Корневой 404 и экран сбоя на весь экран: оболочки (а с ней и main) вокруг них нет
    expect(readCode("app/not-found.tsx")).toContain("<main");
    expect(readCode("app/global-error.tsx")).toContain("<main");
    expect(readCode("components/shell/error-screen.tsx")).toContain("<main");
  });

  it("у каждого кабинета есть свой error.tsx: сбой страницы не уносит меню", () => {
    for (const file of ["app/(client)/error.tsx", "app/(agency)/a/error.tsx"]) {
      const text = readCode(file);
      expect(text, file).toMatch(/^"use client";/);
      expect(text, file).toContain("<ErrorScreen");
      expect(text, file).toContain('layout="cabinet"');
    }
  });
});

describe("таблицы", () => {
  it("у каждой таблицы есть подпись (caption), у каждого заголовка — scope", () => {
    const bad: string[] = [];
    for (const { file, text } of ALL) {
      if (file === "components/ui/table.tsx") continue; // заготовка: TableCaption и scope по умолчанию
      if (openingTags(text, "table").length === 0) continue;
      if (!text.includes("<caption")) bad.push(`${file}: нет <caption>`);
      for (const th of openingTags(text, "th")) if (!/\bscope=/.test(th)) bad.push(`${file}: <th> без scope`);
    }
    expect(bad).toEqual([]);
  });

  it("заготовка Table: заголовок столбца по умолчанию scope=col", () => {
    expect(read("components/ui/table.tsx")).toMatch(/<th[^>]*scope="col"/);
  });

  it("прокручиваемые таблицы и сетки сайта — через ScrollRegion, а не голым overflow-x-auto", () => {
    const files = [
      "app/(marketing)/privacy/page.tsx",
      "app/(marketing)/audit/page.tsx",
      "components/marketing/sections.tsx",
      "app/(agency)/a/analytics/page.tsx",
    ];
    const bad: string[] = [];
    for (const file of files) {
      const text = readCode(file);
      const total = (text.match(/overflow-x-auto/g) ?? []).length;
      const inRegion = openingTags(text, "ScrollRegion").filter((t) => t.includes("overflow-x-auto")).length;
      if (total === 0) bad.push(`${file}: нет прокручиваемой области — правило устарело?`);
      if (total !== inRegion) bad.push(`${file}: overflow-x-auto вне ScrollRegion (${total - inRegion})`);
      for (const tag of openingTags(text, "ScrollRegion")) if (!/\blabel=/.test(tag)) bad.push(`${file}: ScrollRegion без label`);
    }
    expect(bad).toEqual([]);
  });
});

describe("липкие шапки и отступ прокрутки", () => {
  const css = read("app/globals.css");

  it("высоту шапок задают токены, и по ним же считается отступ прокрутки", () => {
    expect(read("components/shell/app-shell.tsx")).toContain("h-(--cabinet-header-h)");
    expect(read("components/marketing/header.tsx")).toContain("h-(--site-header-h)");
    expect(css).toMatch(/html:has\(\.cabinet-shell\)\s*{[^}]*scroll-padding-top:[^;}]*--cabinet-header-h/);
    expect(css).toMatch(/html:has\(\.marketing-shell\)\s*{[^}]*scroll-padding-top:[^;}]*--site-header-h/);
  });

  it("нижняя панель на телефоне: отступ снизу — из токенов --tabbar-*, не числом", () => {
    const rule = css.match(/html:has\(\.cabinet-shell\)\s*{[^}]*scroll-padding-bottom:([^;}]*)/);
    expect(rule?.[1]).toContain("--tabbar-h");
    expect(rule?.[1]).toContain("--tabbar-offset");
  });

  it("токены панели живут на :root: документ, который прокручивается, переменных оболочки не видит", () => {
    const root = [...css.matchAll(/(^|\n):root\s*{([^}]*)}/g)].map((m) => m[2]).join("\n");
    for (const token of ["--tabbar-h", "--tabbar-offset", "--tabbar-space", "--cabinet-header-h", "--site-header-h"]) {
      expect(root, token).toContain(`${token}:`);
    }
    const shell = css.match(/\n\.cabinet-shell\s*{([^}]*)}/g)?.join("\n") ?? "";
    expect(shell).not.toContain("--tabbar-h:");
  });

  it("ссылка «К содержимому» скрыта до фокуса, а не убрана из порядка Tab", () => {
    expect(css).toMatch(/\.skip-link\s*{[^}]*clip-path:\s*inset\(50%\)/);
    expect(css).toMatch(/\.skip-link:focus\s*{[^}]*clip-path:\s*none/);
    expect(css).not.toMatch(/\.skip-link\s*{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.skip-link\s*{[^}]*visibility:\s*hidden/);
  });
});
