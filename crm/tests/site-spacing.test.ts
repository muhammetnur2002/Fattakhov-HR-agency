/**
 * Отступы сайта — по шкале 4/8: 4, 8, 12, 16, 24… Допуск — 2 и 6 (мелкие зазоры у значков).
 *
 * Сверка 08.10.2026: пятая часть отступов вне шкалы, главные — 10px (`px-2.5`, `gap-2.5`)
 * и 14px (`py-3.5`). Тест не даёт вернуть полушаги 2.5 и 3.5 в разметку сайта.
 * Размеры значков (`size-3.5`) и кнопки shadcn сюда не относятся.
 * Инструмент страницы `/audit` лежит в `components/audit`, а не в `components/marketing`: первый
 * заход его не просканировал, и два отступа 10px остались.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

describe("отступы сайта", () => {
  it("нет отступов 10px и 14px (x-2.5, x-3.5)", () => {
    const pattern = /(?<![\w-])(?:[a-z0-9]+:)*(?:px|py|gap|gap-x|gap-y|space-y|space-x|mt|mb|pt|pb|my|mx|pl|pr)-(?:2|3)\.5(?![\w.])/g;
    const offenders: string[] = [];
    for (const file of [
      ...sources("components/marketing"),
      ...sources("components/audit"),
      ...sources("app/(marketing)"),
    ]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const m of text.matchAll(pattern)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
