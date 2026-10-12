/**
 * Воронка студплатформы: шапка страницы в общей раскладке и общий ряд шапок колонок.
 *
 * Сверка по скриншоту заказчика: кнопка «Все клиенты» уходила под подпись, а не стояла
 * справа от заголовка, как на соседних страницах; первые карточки пяти колонок
 * начинались на разной высоте, потому что подсказки этапов разной длины.
 * Положение в браузере меряет tests/e2e/students-funnel-layout.spec.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const page = readFileSync(join(ROOT, "app/(agency)/a/clients/funnel/page.tsx"), "utf8");

describe("воронка студплатформы", () => {
  it("шапка — общий PageHeader, а не своя flex-строка", () => {
    expect(page).toContain("<PageHeader");
    expect(page).not.toMatch(/flex flex-wrap items-start justify-between/);
  });

  it("шапки колонок — общий ряд через subgrid, без фиксированных высот", () => {
    expect(page).toContain("lg:grid-rows-[auto_1fr]");
    expect(page).toContain("lg:row-span-2");
    expect(page).toContain("lg:grid-rows-subgrid");
    // «чтобы выровнять» не подпирают пикселями: ни min-h-[…], ни h-[…px] у шапки колонки
    expect(page).not.toMatch(/(?<![\w-])(min-h|h)-\[\d+(px|rem)\]/);
  });

  it("колонка не шире своей дорожки: min-w-0 и одна колонка minmax(0,1fr)", () => {
    // без них длинное слово в карточке растягивало колонку и наезжало на соседнюю
    expect(page).toMatch(/<section[^>]*min-w-0[^>]*lg:grid-cols-1/);
  });

  it("промежуток между шапкой и карточками задаёт родитель, а у subgrid своего gap нет", () => {
    const section = /<section[^>]*className="([^"]*)"/.exec(page)?.[1] ?? "";
    expect(section).not.toMatch(/(?<![\w-])gap-/);
    expect(section).toMatch(/lg:space-y-0/);
  });
});
