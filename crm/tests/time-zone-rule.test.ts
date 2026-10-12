/**
 * Сторож: время превращается в текст только в lib/format-date.ts.
 *
 * Прямой `Intl.DateTimeFormat` или `toLocale*String` без зоны считает в зоне
 * процесса. Контейнер стоит в UTC, браузер — где угодно: первый кадр на
 * сервере и гидратация показывали разные часы, и React пересобирал
 * дерево с предупреждением. Исключения перечислены ниже вместе с причиной;
 * новое исключение без причины тест не пропустит.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCANNED = ["app", "components", "lib", "jobs"];
const SKIP_DIRS = new Set(["node_modules", "generated", ".next"]);

/** То, чего не должно быть вне белого списка. Комментарии вырезаются до проверки. */
const BANNED = [
  { name: "toLocaleDateString / toLocaleTimeString / toLocaleString", pattern: /\.toLocale(?:Date|Time)?String\s*\(/ },
  { name: "Intl.DateTimeFormat", pattern: /\bIntl\s*\.\s*DateTimeFormat/ },
  { name: "Intl.RelativeTimeFormat", pattern: /\bIntl\s*\.\s*RelativeTimeFormat/ },
];

const ALLOWED: Record<string, string> = {
  "lib/format-date.ts": "единственное место, где время становится текстом: зона всегда названа явно",
  "lib/calendar/timezone.ts":
    "перевод «настенного» времени из формы в момент и обратно: смещение зоны берётся через formatToParts, это не показ",
  "components/ui/calendar.tsx":
    "заготовка shadcn поверх react-day-picker, который сам оперирует локальными датами браузера; нигде не подключена",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Без комментариев: упоминание запрета в пояснении не должно срабатывать. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = SCANNED.flatMap((dir) => walk(path.join(ROOT, dir))).map((f) =>
  path.relative(ROOT, f).split(path.sep).join("/"),
);

describe("время в текст только через lib/format-date.ts", () => {
  it("вне белого списка нет прямых Intl.DateTimeFormat и toLocale*String", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file in ALLOWED) continue;
      const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      for (const { name, pattern } of BANNED) {
        if (pattern.test(source)) violations.push(`${file}: ${name}`);
      }
    }
    expect(
      violations,
      "Форматируй через lib/format-date.ts (formatInZone, formatDateTime, …) с зоной пользователя: " +
        "getUserTimeZone() на сервере, useTimeZone() в клиентском компоненте",
    ).toEqual([]);
  });

  it("каждое исключение названо с причиной и всё ещё нужно", () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, `${file}: у исключения нет причины`).toBeGreaterThan(20);
      expect(files, `${file}: файла больше нет — уберите исключение`).toContain(file);
      const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      const used = BANNED.some(({ pattern }) => pattern.test(source));
      expect(used, `${file}: прямых вызовов уже нет — уберите исключение`).toBe(true);
    }
  });

  it("формат без зоны не возвращается через date-fns и moment", () => {
    const offenders = files.filter((file) =>
      /from\s+["'](?:date-fns|moment|dayjs)/.test(readFileSync(path.join(ROOT, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
