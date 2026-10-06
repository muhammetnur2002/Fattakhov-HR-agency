/**
 * Планировщик фоновых задач не тянет Next.
 *
 * jobs/scheduler.ts запускается отдельным процессом под tsx, в образе tools,
 * без сервера и без запроса. Модуль, который импортирует next/headers (или
 * next/cache, next/navigation, next-auth), в такой цепочке — заготовка для
 * сбоя: в этом процессе нет ни запроса, ни окружения Next. Так и вышло с
 * очисткой журнала входов, пока её не вынесли в auth-events-retention.ts.
 * Тест обходит импорты от jobs/tasks.ts и scheduler.ts и ищет такие модули.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FORBIDDEN = /^(next\/(headers|cache|navigation|server)|server-only|next-auth(\/.*)?)$/;

function resolveModule(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : path.join(path.dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate.split(path.sep).join("/");
  }
  return null;
}

/** Все модули проекта, достижимые из entry, и найденные по пути запрещённые импорты. */
function walk(entry: string): { visited: Set<string>; offenders: string[] } {
  const visited = new Set<string>();
  const offenders: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    // import … from "x" и import("x"); type-only импорты стираются и ничего не грузят
    const specs = [
      ...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm),
      ...source.matchAll(/^import\s+["']([^"']+)["']/gm),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specs) {
      if (FORBIDDEN.test(spec)) {
        offenders.push(`${file} → ${spec}`);
        continue;
      }
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        const resolved = resolveModule(file, spec);
        if (resolved) queue.push(resolved);
      }
    }
  }
  return { visited, offenders };
}

describe("цепочка планировщика", () => {
  for (const entry of ["jobs/tasks.ts", "jobs/scheduler.ts"]) {
    it(`${entry}: ни один модуль не импортирует next/headers, next/cache, next/navigation и next-auth`, () => {
      const { visited, offenders } = walk(entry);
      // Обход должен реально дойти до очистки журнала, иначе тест ничего не проверяет
      if (entry === "jobs/tasks.ts") {
        expect([...visited]).toContain("lib/services/auth-events-retention.ts");
      }
      expect(visited.size).toBeGreaterThan(5);
      expect(offenders).toEqual([]);
    });
  }

  it("очистка журнала входов вынесена туда, где нет заголовков запроса", () => {
    const retention = readFileSync("lib/services/auth-events-retention.ts", "utf8");
    expect(retention).not.toMatch(/from "next\//);
    expect(readFileSync("jobs/tasks.ts", "utf8")).toContain("auth-events-retention");
  });
});
