/**
 * Разбор исходников JSX для тестов-сторожей (не для приложения).
 *
 * Тесты правил вёрстки читают `.tsx` как текст. Простое `<div [^>]*className=…>` ломается
 * на стрелке `=>` и на `>` внутри `{…}`: тег обрывается раньше `className`, и нарушение
 * не видно. Так панель решения (`<form onSubmit={() => …} className="… rounded-md border p-3">`)
 * прошла мимо `panel-rule`, пока тест искал className регулярным выражением. Здесь тег
 * читается по скобкам и кавычкам, как это делает сам JSX.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("../..", import.meta.url).pathname;

/** Все `.tsx` внутри каталога (путь от корня проекта). */
export function sources(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

export function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

export type JsxTag = {
  /** Имя тега: `div`, `Button`, `motion.form`. */
  name: string;
  /** Весь открывающий тег от `<` до `>`. */
  text: string;
  /** Положение `<` в файле. */
  index: number;
  /** Строка файла (с 1), где открывается тег. */
  line: number;
  /** Все строки внутри `className` самого тега (вложенные элементы в пропсах не считаются). */
  classes: string;
  /** Тег закрыт сам (`<Input … />`): детей у него нет. */
  selfClosing: boolean;
};

export type JsxNode = JsxTag & {
  parent: JsxNode | null;
  /** Прямые дети-элементы (текст и выражения не считаются). */
  children: JsxNode[];
};

/** Строки-литералы внутри выражения: "…", '…', `…` (подстановки `${…}` отбрасываются). */
function stringLiterals(expr: string): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`((?:[^`\\]|\\.)*)`/g)) {
    out.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
  }
  return out;
}

/**
 * Открывающие теги JSX. `names` — регулярное выражение для имени (по умолчанию любое).
 * Закрывающие теги, фрагменты и обобщённые типы (`useState<string>`) не попадают:
 * перед `<` не должно быть буквы, цифры и `$`.
 */
export function jsxTags(text: string, names = "[A-Za-z][\\w.]*"): JsxTag[] {
  const tags: JsxTag[] = [];
  const start = new RegExp(`(?<![\\w$])<(${names})(?![\\w.-])`, "g");
  for (const m of text.matchAll(start)) {
    const index = m.index ?? 0;
    let depth = 0;
    let quote: string | null = null;
    let i = index + m[0].length;
    let classAt = -1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      else if (depth === 0 && classAt < 0 && text.startsWith("className=", i) && /\s/.test(text[i - 1] ?? "")) {
        classAt = i + "className=".length;
      }
    }
    const tagText = text.slice(index, i + 1);
    let classes = "";
    if (classAt >= 0) {
      const rel = classAt - index;
      const first = tagText[rel];
      if (first === '"' || first === "'") {
        const end = tagText.indexOf(first, rel + 1);
        classes = tagText.slice(rel + 1, end < 0 ? undefined : end);
      } else if (first === "{") {
        let d = 0;
        let q: string | null = null;
        let j = rel;
        for (; j < tagText.length; j++) {
          const c = tagText[j];
          if (q) {
            if (c === "\\") j++;
            else if (c === q) q = null;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") q = c;
          else if (c === "{") d++;
          else if (c === "}" && --d === 0) break;
        }
        classes = stringLiterals(tagText.slice(rel, j + 1)).join(" ");
      }
    }
    tags.push({
      name: m[1],
      text: tagText,
      index,
      line: text.slice(0, index).split("\n").length,
      classes: classes.replace(/\s+/g, " ").trim(),
      selfClosing: tagText.endsWith("/>"),
    });
  }
  return tags;
}

/** Есть ли в строке классов утилита (без вариантов `md:` и без частичных совпадений). */
export function hasClass(classes: string, pattern: RegExp): boolean {
  return classes.split(" ").some((c) => pattern.test(c));
}

/**
 * Дерево элементов файла: у каждого тега есть родитель и прямые дети. Нужно, чтобы спросить
 * «в каком контейнере лежит подпись и какой у него шаг», а не гадать по соседним строкам.
 */
export function jsxTree(text: string): JsxNode[] {
  const opens = jsxTags(text);
  const events: Array<{ at: number; open?: JsxNode; close?: string }> = opens.map((t) => ({
    at: t.index,
    open: { ...t, parent: null, children: [] },
  }));
  for (const m of text.matchAll(/<\/([A-Za-z][\w.]*)\s*>/g)) events.push({ at: m.index ?? 0, close: m[1] });
  events.sort((a, b) => a.at - b.at);

  const stack: JsxNode[] = [];
  for (const ev of events) {
    if (ev.open) {
      const node = ev.open;
      node.parent = stack[stack.length - 1] ?? null;
      node.parent?.children.push(node);
      if (!node.selfClosing) stack.push(node);
    } else if (ev.close) {
      let k = stack.length - 1;
      while (k >= 0 && stack[k].name !== ev.close) k--;
      if (k >= 0) stack.length = k;
    }
  }
  return events.flatMap((e) => (e.open ? [e.open] : []));
}
