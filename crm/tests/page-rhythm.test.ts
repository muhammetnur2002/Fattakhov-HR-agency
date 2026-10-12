/**
 * Ритм страниц кабинета: расстояние между блоками верхнего уровня — space-y-6.
 *
 * Сверка 08.10.2026: из 54 страниц 8 отклонялись (space-y-4, -5, -8): в
 * разделе «Студенты» три разных ритма подряд (5, 4 и 6), у справки 8.
 * Корень страницы, у которого есть space-y-N, обязан иметь N = 6.
 * Исключение — мессенджер: экран на всю высоту без вертикального ритма.
 *
 * Сверка 11.10.2026: тест смотрел только `app/(agency)` и `app/(client)` и только первый `return`
 * страницы, поэтому у `/onboarding` корень `space-y-8` (вторая ветка страницы) остался. Теперь
 * проверяются все группы маршрутов, кроме витрины сайта (у неё своя шкала секций), и каждый
 * `return` в самой странице. Новая группа `app/(…)` подхватывается сама.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

/** Группы маршрутов кабинетов и страниц входа; витрина сайта живёт по своей шкале секций. */
function groups(): string[] {
  return readdirSync(join(ROOT, "app"))
    .filter((d) => /^\(.+\)$/.test(d) && d !== "(marketing)")
    .map((d) => `app/${d}`);
}

function pages(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => /(^|\/)(page|layout)\.tsx$/.test(f))
    .map((f) => join(dir, f));
}

/** Тело страницы: от `export default` до закрывающей скобки функции (вспомогательные ниже не в счёт). */
function pageBody(text: string): string {
  const start = text.search(/export default/);
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.search(/\n}\n/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("ритм страниц", () => {
  it("видит все группы маршрутов, кроме витрины", () => {
    expect(groups()).toEqual(
      expect.arrayContaining(["app/(agency)", "app/(client)", "app/(onboarding)", "app/(public)"]),
    );
    expect(groups()).not.toContain("app/(marketing)");
  });

  it("корень страницы или раздела — space-y-6", () => {
    const offenders: string[] = [];
    for (const file of groups().flatMap(pages)) {
      const body = pageBody(readFileSync(join(ROOT, file), "utf8"));
      for (const m of body.matchAll(/return \(\s*<div className="([^"]*)"/g)) {
        const spacing = /(?<![\w-])space-y-(\d+)/.exec(m[1]);
        if (spacing && spacing[1] !== "6") offenders.push(`${relative(".", file)}  ${m[1]}`);
      }
    }
    expect(offenders, "корневой блок страницы — space-y-6").toEqual([]);
  });
});
