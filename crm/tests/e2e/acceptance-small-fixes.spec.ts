/**
 * Мелочи итоговой приёмки 15.10.2026, которые видны только в браузере:
 * подпись этапа воронки, зона нажатия галочки, цели касания на /register, предупреждения Next про
 * фактуру и лента тарифов с клавиатуры. Разметку держит tests/acceptance-cabinet-site.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const axeSource = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

test.describe("кабинет агентства", () => {
  test.use({ storageState: "tests/e2e/.auth/owner.json", reducedMotion: "reduce" });

  test("воронка аналитики: подпись этапа переносится, а не усекается («Финальный этап / тестовое» выступало на 12px)", async ({ page }) => {
    await page.goto("/a/analytics", { waitUntil: "networkidle" });
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll('main [class*="w-44"][title]')].map((el) => ({
          text: el.textContent,
          over: (el as HTMLElement).scrollWidth - (el as HTMLElement).clientWidth,
          ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
        })),
      );
      expect(labels.length, `${width}: в воронке несколько этапов`).toBeGreaterThanOrEqual(5);
      for (const label of labels) {
        expect(label.over, `${width}: «${label.text}» шире своей колонки`).toBeLessThanOrEqual(1);
        expect(label.ellipsis, `${width}: у «${label.text}» многоточие`).toBe(false);
      }
    }
  });

  test.describe("сенсорный экран", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("галочка карточки кандидата ловит нажатие в квадрате 40px, а не 38", async ({ page }) => {
      await page.goto("/a/vacancies/vac_1", { waitUntil: "networkidle" });
      const zones = await page.evaluate(() =>
        // карточки на странице вакансии в разметке дважды (доска и список), один набор скрыт CSS
        [...document.querySelectorAll('[data-slot="checkbox"]')].filter((el) => (el as HTMLElement).checkVisibility()).map((el) => {
          const after = getComputedStyle(el, "::after");
          return { width: after.width, height: after.height, box: Math.round(el.getBoundingClientRect().width) };
        }),
      );
      expect(zones.length, "на странице вакансии есть галочки карточек").toBeGreaterThan(0);
      for (const zone of zones) {
        expect(zone.box, "сама галочка остаётся 16px").toBe(16);
        expect(`${zone.width} ${zone.height}`).toBe("40px 40px");
      }
    });
  });
});

test.describe("регистрация", () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

  for (const [name, viewport, touch] of [
    ["телефон", { width: 375, height: 800 }, true],
    ["узкий телефон", { width: 320, height: 700 }, true],
    ["ноутбук", { width: 1280, height: 800 }, false],
  ] as const) {
    test(`/register, ${name}: «Текст согласия» и ссылка на политику — не мельче 24x24 (WCAG 2.5.8), строка не выросла`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      await page.goto("/register", { waitUntil: "networkidle" });
      const sizes = await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((b) => /Текст согласия/.test(b.textContent ?? ""))!;
        const link = [...document.querySelectorAll("a")].find((a) => /Политика обработки данных/.test(a.textContent ?? ""))!;
        const box = button.parentElement!;
        const rect = (el: Element) => el.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(box).lineHeight);
        return {
          button: [rect(button).width, rect(button).height],
          link: [rect(link).width, rect(link).height],
          // блок «Текст согласия · Политика» — одна или две строки текста, а не строки по 24px и более
          lines: Math.round(rect(box).height / line),
          // ссылка ушла на вторую строку: её центр ниже центра раскрывашки (рамки целей на 8px перекрываются, поэтому по краям не судим)
          wraps: rect(link).top + rect(link).height / 2 - (rect(button).top + rect(button).height / 2) > 8,
        };
      });
      expect(sizes.button[0]).toBeGreaterThanOrEqual(24);
      expect(sizes.button[1]).toBeGreaterThanOrEqual(24);
      expect(sizes.link[0]).toBeGreaterThanOrEqual(24);
      expect(sizes.link[1]).toBeGreaterThanOrEqual(24);
      expect(sizes.lines, `блок «Текст согласия · Политика» занял ${sizes.lines} строк текста`).toBeLessThanOrEqual(sizes.wraps ? 2 : 1);
      await context.close();
    });
  }
});

test.describe("сайт", () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

  test("/cases: Next не предупреждает про `sizes` у фактуры «рёбра» (100vw на плитке уже окна)", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
    });
    for (const width of [1440, 1280, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/cases", { waitUntil: "load" });
      await page.waitForTimeout(1500);
    }
    // Только про ширину: «LCP… добавьте loading="eager"» — ложное срабатывание dev-режима Next (одна картинка
    // в шапке eager и ниже lazy, реестр хранит одну запись на адрес), в AGENTS.md описано отдельно
    expect(warnings.filter((w) => /slate-ribbed/.test(w) && /full viewport width/.test(w))).toEqual([]);
  });

  test("/tariffs: лента тарифов, пока прокручивается, — область с именем и остановкой Tab, с видимым кольцом", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/tariffs", { waitUntil: "networkidle" });
    const strip = page.locator(".snap-x");
    await expect(strip).toHaveAttribute("tabindex", "0");
    await expect(strip).toHaveAttribute("role", "region");
    await expect(strip).toHaveAttribute("aria-label", "Тарифы");

    // axe: прокручиваемая область доступна с клавиатуры
    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      // @ts-expect-error axe подключён строкой выше
      const result = await axe.run(document, { runOnly: ["scrollable-region-focusable"] });
      return result.violations.map((v: { id: string }) => v.id);
    });
    expect(violations).toEqual([]);

    // настоящий Tab доходит до ленты и обводит её; стрелка вправо листает
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.classList.contains("snap-x") ?? false);
    }
    expect(reached, "Tab дошёл до ленты тарифов").toBe(true);
    // кольцо — тень (ring-2 у ScrollRegion), контур отключён: смотрим на то, что реально нарисовано
    const ring = await strip.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, outline: cs.outlineStyle };
    });
    expect(ring.shadow !== "none" || ring.outline !== "none", `у ленты в фокусе нет кольца: ${JSON.stringify(ring)}`).toBe(true);
    expect(ring.shadow, "кольцо внутрь (inset)").toMatch(/inset/);
    const before = await strip.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    expect(await strip.evaluate((el) => el.scrollLeft), "стрелка вправо листает ленту").toBeGreaterThan(before);
  });

  test("/tariffs на 1600: лента — сетка без прокрутки, лишней остановки Tab нет", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/tariffs", { waitUntil: "networkidle" });
    const strip = page.locator(".snap-x");
    await expect(strip).not.toHaveAttribute("tabindex", /.*/);
    await expect(strip).not.toHaveAttribute("role", /.*/);
  });
});
