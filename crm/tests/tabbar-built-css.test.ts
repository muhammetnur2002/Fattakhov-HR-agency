/**
 * Стили нижней панели разделов — как они выйдут из сборки, а не как написаны.
 *
 * Зачем отдельно от tests/tabbar-visibility.test.ts. Тот читает исходник `app/globals.css`, а в браузер
 * идёт результат минификатора. Проверка независимой стороны на настоящей сборке (`next build`)
 * показала расхождение: покой был записан `transform: translate3d(0, 0, 0)`, исходник-сторож это
 * видел и был доволен, а минификатор превратил запись в `translate(0, 0)` — 3D-подсказка, ради
 * которой запись стояла (панель на своём слое), до браузера не доходила; `-webkit-backface-visibility`
 * он выбросил. Заявленные «три способа держать слой» в сборке были двумя.
 *
 * Здесь `app/globals.css` прогоняется через тот же lightningcss с теми же целями, что у сборки
 * (Next 16: Chrome/Edge/Firefox 111, Safari 16.4 — `modern-browserslist-target`; оптимизатор
 * Tailwind 4 — те же Safari и iOS 16.4), и проверяется результат. Пакет `lightningcss` в проект
 * приходит вместе с Tailwind (`@tailwindcss/postcss`), отдельной зависимостью не заведён. Директивы
 * Tailwind (`@theme`, `@utility`, `@custom-variant`) он не знает и пропускает с предупреждением, как и в
 * самой сборке; правила панели — обычный CSS и проходят весь путь.
 *
 * Живой `next build` и разбор готовых CSS из `.next/static` остаются ручной сверкой перед выкаткой;
 * этот тест — то, что можно держать зелёным на каждом PR без сборки.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers/jsx-source";

const css = readFileSync(join(ROOT, "app/globals.css"));

// Safari и iOS 16.4 кодируются как (major << 16) | (minor << 8); Chrome и Firefox — 111
const SAFARI_16_4 = (16 << 16) | (4 << 8);
const targets = { safari: SAFARI_16_4, ios_saf: SAFARI_16_4, chrome: 111 << 16, firefox: 111 << 16, edge: 111 << 16 };

const result = transform({
  filename: "globals.css",
  code: css,
  minify: true,
  targets,
  errorRecovery: true,
  drafts: { customMedia: true },
  nonStandard: { deepSelectorCombinator: true },
});
const built = result.code.toString();

/**
 * Плоские правила готового CSS (в том числе вложенные в @supports и @media): селектор, тело и глубина
 * вложенности (0 — на верхнем уровне, 1 — внутри @supports или @media).
 */
const rules = Array.from(built.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => {
  const before = built.slice(0, m.index);
  return { selector: m[1].trim(), body: m[2], depth: (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length };
});
const panelRules = rules.filter((r) => r.selector.includes("data-bottom-tabs"));

/** Есть ли в записи transform 3D-подсказка слою: translateZ или translate3d с ненулевой Z. */
const keeps3dHint = (transformValue: string) => /translateZ\(|translate3d\(/.test(transformValue);

describe("готовый CSS панели разделов (после того же минификатора, что в сборке)", () => {
  it("предупреждения минификатора — только про директивы Tailwind, не про правила панели", () => {
    const unexpected = result.warnings.filter((w) => !/Unknown at rule: @(theme|utility|custom-variant|source|plugin|config|apply|variant|reference)/.test(w.message));
    expect(unexpected.map((w) => w.message)).toEqual([]);
  });

  it("правила панели дошли до готового CSS", () => {
    expect(panelRules.length, "правила панели найдены").toBeGreaterThanOrEqual(5);
  });

  /**
   * Основное правило панели одним телом. В настоящей сборке (Tailwind и Next в два прохода) оно приходит
   * разрезанным: запасной цвет без color-mix отдельно, затем `@supports (color: color-mix(…))` со своим
   * цветом, затем размытие и тени. Все куски лежат на верхнем уровне подряд, и вместе они — то же правило.
   */
  const base = () => {
    const parts = panelRules.filter((r) => r.selector === "[data-bottom-tabs]" && r.depth === 0);
    expect(parts.some((r) => r.body.includes("will-change")), "в готовом CSS есть основное правило панели с will-change").toBe(true);
    return parts.map((r) => r.body).join(";");
  };

  it("покой: transform с 3D-подсказкой пережил минификатор (translate3d(0, 0, 0) в translate(0, 0) не превращается)", () => {
    const body = base();
    const value = body.match(/(?:^|;)transform:([^;]*)/)?.[1];
    expect(value, `в основном правиле есть transform: ${body}`).toBeDefined();
    expect(keeps3dHint(value!), `в готовом CSS transform покоя «${value}» — 3D-подсказки нет`).toBe(true);
    expect(value).toBe("translateZ(0)");
    // Сам сторож различает записи: плоская запись, в которую превращается translate3d(0, 0, 0), подсказки не несёт
    expect(keeps3dHint("translate(0,0)")).toBe(false);
    expect(keeps3dHint("translate(0)")).toBe(false);
  });

  it("слой держат и will-change: transform, и backface-visibility: hidden", () => {
    const body = base();
    expect(body).toMatch(/(?:^|;)will-change:transform(;|$)/);
    expect(body).toMatch(/(?:^|;)backface-visibility:hidden(;|$)/);
  });

  it("стекло: -webkit-backdrop-filter остался (Safari до 18 понимает размытие только с приставкой)", () => {
    const body = base();
    expect(body).toMatch(/(?:^|;)-webkit-backdrop-filter:blur\(/);
    expect(body).toMatch(/(?:^|;)backdrop-filter:blur\(/);
  });

  it("спрятанная и спрятанная вводом: сдвиг translate3d с переменной цел, нажатия не ловит", () => {
    const hidden = panelRules.find((r) => r.selector.includes("[data-bottom-tabs][data-hidden]"));
    expect(hidden, "правило спрятанной панели").toBeDefined();
    expect(hidden!.body).toMatch(/transform:translate3d\(0,\s*var\(--tabbar-away\),\s*0\)/);
    expect(hidden!.body).toMatch(/pointer-events:none/);
    // Правило про ввод в поле и экран без вкладок — то же самое положение
    expect(hidden!.selector).toContain("textarea:focus");
    expect(hidden!.selector).toContain("[data-hides-bottom-tabs]");
  });

  it("на iOS перехода нет: @supports (-webkit-touch-callout: none) отключает transition, на верхнем уровне, не в слое", () => {
    const needle = "@supports (-webkit-touch-callout:none){[data-bottom-tabs]{transition:none}}";
    const at = built.indexOf(needle);
    expect(at, "правило для iOS есть в готовом CSS в том виде, как задумано").toBeGreaterThanOrEqual(0);
    // Нулевая глубина: правило не вложено ни в @layer, ни в @media; иначе его перебила бы утилита transition-[transform] класса панели
    const before = built.slice(0, at);
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth, "правило не вложено в @layer или @media").toBe(0);
  });

  it("прозрачности нет ни в одном правиле панели: панель либо на месте, либо за краем", () => {
    for (const rule of panelRules) {
      expect(rule.body, `в «${rule.selector}» есть opacity`).not.toMatch(/(^|[;\s])opacity:/);
      expect(rule.body, `в «${rule.selector}» есть transition-property с opacity`).not.toMatch(/transition[^;]*opacity/);
    }
  });
});
