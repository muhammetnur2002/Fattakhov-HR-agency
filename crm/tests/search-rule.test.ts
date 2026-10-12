/**
 * Поиск: ширина из одного места, шаблон «поиск + фильтры» у всех списков.
 *
 * Сверка по скриншотам заказчика: поле поиска в шапке — 320 точек, а подсказка
 * «Найти вакансию, кандидата…» обрезалась на слове «кандидат»; в списках — 283
 * (вакансии, заявки), 400 (кандидаты), 480 (клиенты), у части сжималось до
 * содержимого в ряду с фильтрами. Просьба: везде не короче чем в полтора раза и
 * одной длины в каждом разделе. Здесь — защита от возврата: ширина задана в
 * `list-toolbar.tsx` и `global-search-field.tsx`, а не в разметке страниц.
 * Живую раскладку на 768–1440 и телефоне меряет `tests/e2e/search-width.spec.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

function sources(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

/** Ширины контейнеров Tailwind в rem (max-w-sm … max-w-3xl) — для сравнения «в полтора раза». */
const CONTAINER_REM: Record<string, number> = { xs: 20, sm: 24, md: 28, lg: 32, xl: 36, "2xl": 42, "3xl": 48 };

describe("ширина поиска", () => {
  it("в списках — не меньше 1,5 от прежнего наибольшего (max-w-sm = 24rem → max-w-xl = 36rem)", () => {
    const cls = /export const LIST_SEARCH_CLASS = "([^"]+)"/.exec(read("components/shell/list-toolbar.tsx"))?.[1] ?? "";
    expect(cls, "LIST_SEARCH_CLASS не найден").not.toBe("");
    const max = /(?<![\w-])max-w-(\w+)/.exec(cls)?.[1];
    expect(CONTAINER_REM[max ?? ""], `max-w-${max}`).toBeGreaterThanOrEqual(CONTAINER_REM.sm * 1.5);
    // и тянется на всю ширину узкого экрана, а не сжимается до содержимого
    expect(cls.split(/\s+/)).toContain("w-full");
  });

  it("в шапке — не меньше 1,5 от прежнего w-64 (96 = w-96), и сжимается, если места нет", () => {
    const cls = /export const HEADER_SEARCH_CLASS =\s*"([^"]+)"/.exec(read("components/shell/global-search-field.tsx"))?.[1] ?? "";
    expect(cls, "HEADER_SEARCH_CLASS не найден").not.toBe("");
    const max = Number(/(?<![\w-])md:max-w-(\d+)/.exec(cls)?.[1]);
    expect(max).toBeGreaterThanOrEqual(64 * 1.5);
    expect(cls.split(/\s+/)).toContain("min-w-0");
    // фиксированной w-N у поля нет: она не растёт и не сжимается — так и обрезалась подсказка
    expect(cls).not.toMatch(/(?<![\w-])(md:)?w-\d/);
  });

  it("имя пользователя в шапке — только от xl: на планшете и 1024 его место нужно поиску", () => {
    // Имя занимает до ~200 точек шапки; с ним поле сжималось до 226 на планшете и до 475 на 1024
    const menu = read("components/shell/user-menu.tsx");
    expect(menu).toMatch(/<span className="hidden [^"]*xl:inline">\{fullName\}<\/span>/);
    expect(menu).not.toMatch(/<span className="hidden [^"]*(sm|md|lg):inline">\{fullName\}/);
  });

  it("подсказка в шапке короткая: влезает целиком в самое узкое поле планшета", () => {
    const text = /placeholder="([^"]+)"/.exec(read("components/shell/global-search-field.tsx"))?.[1] ?? "";
    expect(text.length, text).toBeLessThanOrEqual(20);
  });
});

describe("шаблон «поиск + фильтры»", () => {
  it("оба поля поиска списков рисует ListSearchInput и ширину они сами не задают", () => {
    for (const file of ["components/shell/search-field.tsx", "components/candidates/candidate-filters.tsx"]) {
      const text = read(file);
      expect(text, file).toContain("<ListSearchInput");
      // у ListSearchInput нет className: ширину здесь не переопределяют
      expect(text, file).not.toMatch(/<ListSearchInput[^>]*className=/);
      expect(text, file).not.toMatch(/lucide-react/);
    }
  });

  it("страницы списков ставят поиск только внутрь ListToolbar", () => {
    const offenders: string[] = [];
    for (const file of [...sources("app"), ...sources("components")]) {
      const text = read(file);
      const usesShellSearch = text.includes('@/components/shell/search-field');
      const usesCandidateFilters = /<CandidateFilters/.test(text);
      if (!usesShellSearch && !usesCandidateFilters) continue;
      if (usesShellSearch && !text.includes("<ListToolbar")) offenders.push(`${relative(".", file)}: SearchField без ListToolbar`);
      const bare = (text.match(/<SearchField/g) ?? []).length;
      const inToolbar = (text.match(/search=\{<SearchField/g) ?? []).length;
      if (bare !== inToolbar) offenders.push(`${relative(".", file)}: SearchField вне search={…} панели`);
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    "app/(agency)/a/vacancies/page.tsx",
    "app/(client)/vacancies/page.tsx",
    "app/(agency)/a/clients/page.tsx",
    "app/(agency)/a/leads/page.tsx",
  ])("список «%s» — на ListToolbar", (file) => {
    expect(read(file)).toContain("<ListToolbar");
  });

  it("кандидаты у обеих сторон — через CandidateFilters, а он собран на ListToolbar", () => {
    expect(read("app/(agency)/a/candidates/page.tsx")).toContain("<CandidateFilters");
    expect(read("app/(client)/candidates/page.tsx")).toContain("<CandidateFilters");
    expect(read("components/candidates/candidate-filters.tsx")).toContain("<ListToolbar");
  });

  it("поиск по всему кабинету: ширину выбирает место (placement), а не страница", () => {
    const field = read("components/shell/global-search-field.tsx");
    expect(field).toMatch(/placement\?: "header" \| "page"/);
    expect(field).not.toMatch(/className\?: string/);
    const offenders = [...sources("app"), ...sources("components")]
      .filter((f) => !f.endsWith("global-search-field.tsx"))
      .filter((f) => /<GlobalSearchField[^>]*className=/.test(read(f)))
      .map((f) => relative(".", f));
    expect(offenders).toEqual([]);
  });
});
