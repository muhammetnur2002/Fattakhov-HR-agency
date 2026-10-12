/**
 * Список кандидатов: колонки общие для всего списка, а не у каждой карточки свои.
 *
 * Сверка по скриншоту заказчика (hierarchy-13): сетка с двумя колонками `auto`
 * объявлялась внутри каждой карточки, ширина этих колонок считалась по тексту
 * своей карточки, остаток делился заново — зарплата и вакансия «плыли» от строки
 * к строке до 41 точки. Теперь сетка одна на списке, карточка берёт её через subgrid.
 * Совпадение левых краёв в браузере меряет tests/e2e/client-application-list-grid.spec.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
// Комментарии вырезаем: в них описана прежняя сетка, и совпадения были бы ложными
const text = readFileSync(join(ROOT, "components/candidates/application-list.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("список кандидатов: общая сетка", () => {
  it("колонки объявлены один раз — на контейнере списка (Stagger)", () => {
    const templates = text.match(/grid-cols-\[[^\]]+\]/g) ?? [];
    expect(templates).toHaveLength(1);
    expect(/<Stagger[^>]*className="[^"]*xl:grid-cols-\[[^\]]+\]/.test(text)).toBe(true);
  });

  it("на уровне карточки нет ни auto-колонок, ни своего шаблона", () => {
    const card = /<CardContent\b[^>]*className=\{([^}]*)\}|<CardContent\b[^>]*className="([^"]*)"/.exec(text);
    const cls = card?.[1] ?? card?.[2] ?? "";
    expect(cls).not.toMatch(/grid-cols-\[/);
    expect(cls).not.toMatch(/\bauto\b/);
  });

  it("вся цепочка StaggerItem → Link → Card → CardContent берёт колонки списка (subgrid)", () => {
    expect(text).toMatch(/const ROW = "[^"]*xl:grid-cols-subgrid[^"]*"/);
    expect(text).toMatch(/const ROW = "[^"]*xl:col-span-full[^"]*"/);
    for (const el of ["StaggerItem", "Link", "Card", "CardContent"]) {
      const open = new RegExp(`<${el}\\b[^>]*\\bROW\\b`).test(text);
      expect(open, `<${el}> без ROW`).toBe(true);
    }
  });

  it("звенья subgrid не перекрывают промежуток родителя: column-gap: normal", () => {
    // Card несёт gap-(--card-spacing); без этого на xl он становится промежутком между колонками
    expect(/const ROW = "[^"]*xl:\[column-gap:normal\]/.test(text)).toBe(true);
  });

  it("свой промежуток у subgrid не объявлен: gap-x задаёт только родитель", () => {
    expect(/<Stagger[^>]*xl:gap-x-6/.test(text)).toBe(true);
    // у CardContent gap — только ниже xl (flex-wrap), чтобы subgrid не спорил с родителем
    const card = /<CardContent\b[^>]*className=\{cn\("([^"]*)"/.exec(text)?.[1] ?? "";
    expect(card).not.toMatch(/(?<![\w:-])gap-x-6/);
    expect(card).toMatch(/max-xl:gap-x-6/);
  });
});
