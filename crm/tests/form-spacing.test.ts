/**
 * Шаг между полями формы — из трёх значений, а не из пяти.
 *
 * Сверка 08.10.2026: на корне форм стояли space-y-1, 2, 3, 4, 5, 6 и 8:
 * соседние формы дышали по-разному. Теперь: 4 — между полями (стандарт),
 * 2 — компактная форма «поле и кнопка», 6 — форма из нескольких разделов
 * (мастер, настройки уведомлений). Пара «подпись — поле» — space-y-2.
 *
 * Правило действует не только на корень `<form>`, но и на вложенные контейнеры: первая версия
 * смотрела один корень, и пара «подпись — поле» с `space-y-1.5` в мастере анкеты, сетка полей
 * с `gap-3` и стопка форм с `space-y-5` остались (сверка 11.10.2026).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTree, type JsxNode } from "./helpers/jsx-source";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}
const FILES = [...sources("app"), ...sources("components")];

/** Открывающие теги <form …>: с учётом скобок {…}, где бывает `=>` и `>`. */
function formTags(text: string): string[] {
  const tags: string[] = [];
  for (const m of text.matchAll(/<(?:motion\.)?form\b/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = (m.index ?? 0) + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && text[i - 1] !== "=") break;
    }
    tags.push(text.slice(m.index, i + 1));
  }
  return tags;
}

describe("шаг между полями формы", () => {
  it("на корне <form> — space-y-2, 4 или 6", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const tag of formTags(text)) {
        const cls = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
        const step = /(?<![\w-])space-y-([\d.]+)/.exec(cls)?.[1];
        if (step && !["2", "4", "6"].includes(step)) offenders.push(`${relative(".", file)}  space-y-${step}`);
      }
    }
    expect(offenders, "шаг между полями: space-y-4 (компактно 2, с разделами 6)").toEqual([]);
  });

  it("обёртка «подпись — поле» — space-y-2, не 1.5", () => {
    const offenders = FILES.filter((file) =>
      /<div className="space-y-1\.5">\s*<Label/.test(readFileSync(join(ROOT, file), "utf8")),
    ).map((f) => relative(".", f));
    expect(offenders).toEqual([]);
  });

  it("мастер заявки и сетки полей — шаг 4, не 5 и не 3", () => {
    // Сверка 08.10.2026: в мастере заявки space-y-5 и gap-5, в сетках полей форм gap-3
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    expect(read("components/vacancies/vacancy-wizard.tsx")).not.toMatch(/(?:space-y|gap)-5/);
    const FIELD_GRIDS = [
      "components/applications/guarantee-case-form.tsx",
      "components/applications/offer-form.tsx",
      "components/finance/invoice-actions.tsx",
      "components/interviews/interview-section.tsx",
      "components/vacancies/agency-vacancy-actions.tsx",
    ];
    const bad = FIELD_GRIDS.filter((f) => /className="grid gap-3[^"]*sm:grid-cols-/.test(read(f)));
    expect(bad, "сетка полей формы — gap-4").toEqual([]);
  });
});

// ── Вложенные контейнеры ────────────────────────────────────────────────────────────────────

const CONTROL_NAMES = /^(Input|Textarea|Select|SelectTrigger|textarea|select|FileInput|DatePicker)$/;
/** Поле ввода: текст, список, файл. Скрытые поля, галочки и кнопки полем не считаются. */
const isControl = (n: JsxNode) =>
  CONTROL_NAMES.test(n.name) || (n.name === "input" && !/type=["{](hidden|checkbox|radio|submit)/.test(n.text));
const hasControl = (n: JsxNode): boolean => isControl(n) || n.children.some(hasControl);
const hasToggle = (n: JsxNode): boolean =>
  (n.name === "input" && /type=["{](checkbox|radio)/.test(n.text)) || n.name === "Checkbox" || n.children.some(hasToggle);
/** Подпись над полем (не строка «галочка — текст»). */
const isCaption = (n: JsxNode) => /^(Label|label)$/.test(n.name) && !hasToggle(n) && !hasControl(n);

/** Вертикальный шаг контейнера: space-y-N, либо gap-N у колонки/сетки. null — шага нет или строка. */
function verticalStep(n: JsxNode): string | null {
  const c = n.classes.split(" ");
  const spaceY = c.find((x) => /^space-y-[\d.]+$/.test(x));
  if (spaceY) return spaceY.slice("space-y-".length);
  const column = c.includes("grid") || c.includes("flex-col");
  const gapY = c.find((x) => /^gap-y-[\d.]+$/.test(x));
  if (gapY) return gapY.slice("gap-y-".length);
  const gap = column ? c.find((x) => /^gap-[\d.]+$/.test(x)) : undefined;
  return gap ? gap.slice("gap-".length) : null;
}

/** Панели фильтров над списком: поля без подписей в плотную строку, это не форма. */
const TOOLBARS = new Set([
  "components/candidates/candidate-filters.tsx",
  "components/vacancies/pick-from-base.tsx",
]);

function nestedOffenders() {
  const pairs: string[] = [];
  const groups: string[] = [];
  for (const file of FILES) {
    if (file.includes("components/ui/")) continue;
    for (const n of jsxTree(readFileSync(join(ROOT, file), "utf8"))) {
      const step = verticalStep(n);
      if (step === null) continue;
      const where = `${relative(".", file)}:${n.line}  <${n.name}> space-y/gap-${step}`;
      const isPair =
        (n.children.some(isCaption) && n.children.some((c) => !isCaption(c) && hasControl(c))) ||
        (n.name === "label" && n.children.some(isControl) && n.children.some((c) => c.name === "span"));
      if (isPair) {
        if (step !== "2") pairs.push(where);
        continue;
      }
      const fieldBlocks = n.children.filter(hasControl).length;
      if (fieldBlocks < 2 || TOOLBARS.has(file)) continue;
      const compactFormRoot = n.name === "form" && step === "2";
      if (!["4", "6"].includes(step) && !compactFormRoot) groups.push(where);
    }
  }
  return { pairs, groups };
}

describe("шаг внутри вложенных контейнеров формы", () => {
  it("пара «подпись — поле» в любом контейнере — space-y-2", () => {
    expect(nestedOffenders().pairs, "подпись и поле под ней — space-y-2 (не 1, 1.5, 3)").toEqual([]);
  });

  it("группа из двух и более полей — шаг 4 (разделы — 6), в сетке gap-4, а не 3 и 5", () => {
    expect(nestedOffenders().groups, "соседние поля и формы — space-y-4 / gap-4; 6 — разделы").toEqual([]);
  });

  it("разбор видит пару и группу в обёртках, а не только на корне формы", () => {
    const [pair, group] = [
      `<div className="space-y-1.5"><Label htmlFor="a">A</Label><Input id="a" /></div>`,
      `<div className="grid gap-3 sm:grid-cols-2"><div><Label>A</Label><Input /></div><div><Label>B</Label><Input /></div></div>`,
    ].map((src) => jsxTree(src)[0]);
    expect(verticalStep(pair)).toBe("1.5");
    expect(pair.children.some(isCaption) && pair.children.some(hasControl)).toBe(true);
    expect(verticalStep(group)).toBe("3");
    expect(group.children.filter(hasControl)).toHaveLength(2);
  });
});
