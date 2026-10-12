/**
 * Ссылки на тесты в шапках тестов живые (12.10.2026, замечание проверки к PR #123).
 *
 * Шапка `a11y-names.test.ts` отсылала к `a11y-names.spec.ts` как к живой проверке axe, а такого
 * файла нет: axe-проход лежит в `consistency-status-money-settings.spec.ts`. Читающий искал бы
 * проверку, которой не существует. Сторож берёт из комментариев каждого теста пути вида
 * `tests/…spec.ts` и `tests/…test.ts(x)` и проверяет, что файл на месте.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/jsx-source";

function testFiles(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => /\.(test|spec)\.tsx?$/.test(f))
    .map((f) => join(dir, f));
}

// Путь собирается из частей: иначе сам сторож нашёл бы в себе «ссылку» и проверял её
const REFERENCE = new RegExp(["tests", "/[a-z0-9/_-]+\\.(?:spec|test)\\.tsx?"].join(""), "g");

describe("ссылки на тесты в комментариях", () => {
  const files = testFiles("tests");

  it("находит тесты для проверки", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("каждый указанный в тексте тест существует", () => {
    const broken: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(ROOT, file), "utf8");
      // Только блочные и строчные комментарии: путь в строке кода может быть данными теста
      const comments = [...text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)].map((m) => m[0]).join("\n");
      for (const ref of new Set(comments.match(REFERENCE) ?? [])) {
        if (!existsSync(join(ROOT, ref))) broken.push(`${file} → ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
