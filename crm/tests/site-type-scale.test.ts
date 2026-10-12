/**
 * Шкала текста сайта: шесть текстовых ступеней и одна акцентная (10.10.2026).
 *
 * Токены --text-* для .marketing-shell заданы в app/globals.css отдельно для телефона
 * (до 640px) и для ноутбука. Здесь — защита от того, чтобы в шкалу тихо вернулись близкие
 * размеры: в наборе значений не больше шести текстовых ступеней, акцент (--text-7xl)
 * один и самый крупный. Живые страницы проверяет tests/e2e/site-typography.spec.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function block(media: RegExp): Record<string, number> {
  const m = media.exec(css);
  if (!m) throw new Error(`нет блока ${media}`);
  const start = css.indexOf("{", css.indexOf(m[0]) + m[0].length);
  let depth = 0;
  let end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(start, end);
  const tokens: Record<string, number> = {};
  for (const t of body.matchAll(/--text-(\w+):\s*([\d.]+)rem;/g)) tokens[t[1]] = Number(t[2]);
  return tokens;
}

const SCALES = [
  { name: "телефон", tokens: block(/@media \(max-width: 639px\) \{\s*\.marketing-shell/) },
  { name: "ноутбук", tokens: block(/@media \(min-width: 640px\) \{\s*\.marketing-shell/) },
];

describe.each(SCALES)("шкала текста сайта: $name", ({ tokens }) => {
  it("не больше шести текстовых ступеней плюс акцентная", () => {
    const { "7xl": accent, ...text } = tokens;
    const steps = [...new Set(Object.values(text))].sort((a, b) => a - b);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(accent, "акцентная ступень задана").toBeGreaterThan(0);
    expect(accent).toBeGreaterThan(Math.max(...steps));
  });

  it("соседние ступени различаются заметно (не меньше 1.2 раза)", () => {
    const { "7xl": accent, ...text } = tokens;
    const all = [...new Set([...Object.values(text), accent])].sort((a, b) => a - b);
    for (let i = 1; i < all.length; i++) {
      // ступени 12 и 13 на телефоне слиты, оставшиеся пары обязаны быть различимы
      expect(all[i] / all[i - 1], `${all[i - 1]}rem → ${all[i]}rem`).toBeGreaterThanOrEqual(1.19);
    }
  });
});

it("текст без своего размера наследует «основной», а не корень", () => {
  expect((css.match(/font-size: var\(--text-base\);/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

it("рамки сайта в тёмной теме различимы: контур не слабее 20%", () => {
  const m = /\.dark \.marketing-shell \{\s*--border: rgb\(248 248 248 \/ (\d+)%\)/.exec(css);
  expect(m, "переопределение --border для .dark .marketing-shell").not.toBeNull();
  expect(Number(m![1])).toBeGreaterThanOrEqual(20);
});

it("h3 сайта не крупнее h2 раздела: без text-5xl и text-6xl, а text-4xl — только с md:/2xl:", () => {
  // Сверка 11.10.2026: выделенная плитка «Кого закрываем» — h3 в 60px при h2 в 45, имя клиента
  // в кейсе — 36px при h2 в 28 на телефоне. h2 раздела — text-3xl md:text-4xl (28/45); h3 не выше.
  // Живые размеры проверяет tests/e2e/site-heading-hierarchy.spec.ts.
  const offenders: string[] = [];
  for (const file of [...sources("components/marketing"), ...sources("app/(marketing)")]) {
    for (const tag of jsxTags(read(file), "h3")) {
      for (const c of tag.classes.split(" ")) {
        const m = /^(?:([a-z0-9]+):)?text-(4xl|5xl|6xl|7xl)$/.exec(c);
        if (!m) continue;
        const [, variant, size] = m;
        const ok = size === "4xl" && (variant === "md" || variant === "2xl");
        if (!ok) offenders.push(`${file}:${tag.line}  ${c}`);
      }
    }
  }
  expect(offenders, "h3 не крупнее h2 раздела (text-3xl md:text-4xl)").toEqual([]);
});
