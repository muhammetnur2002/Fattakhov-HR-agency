/**
 * Выбор и состояния в кабинете (11.10.2026): чипы-фильтры, вкладки, галочки и переключатели
 * на мыши, наведение на поля, ожидание списка и возврат фокуса после окна.
 *
 * Читается живая раскладка: вычисленные цвета, а не классы в исходнике. Контраст считается по
 * формуле WCAG из тех цветов, что браузер реально нарисовал (в обеих темах).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Любой CSS-цвет (rgb, color-mix, oklch) → rgb через холст: браузер сам знает, во что он превращается. */
async function toRgb(page: Page, css: string): Promise<[number, number, number]> {
  return page.evaluate((value) => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, css);
}

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const css = (el: Locator, prop: string) => el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop);

/** Цвет заливки с учётом того, что у невыбранного чипа в тёмной теме он полупрозрачный: красим поверх фона страницы. */
async function paint(page: Page, el: Locator, prop = "background-color"): Promise<[number, number, number]> {
  const color = await css(el, prop);
  const base = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [br, bg, bb] = await toRgb(page, base);
  const m = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/.exec(color);
  if (!m) return toRgb(page, color);
  // Полупрозрачное: смешиваем с фоном вручную (холст выше красит на белом)
  const parts = (m[1] ?? m[2]).split(/[\s,/]+/).filter(Boolean).map(Number);
  const isSrgb = Boolean(m[2]);
  const [r, g, b] = isSrgb ? parts.slice(0, 3).map((v) => v * 255) : parts.slice(0, 3);
  const a = parts[3] ?? 1;
  return [Math.round(r * a + br * (1 - a)), Math.round(g * a + bg * (1 - a)), Math.round(b * a + bb * (1 - a))];
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme === "light" ? "светлая" : "тёмная"} тема`, () => {
    test.use({ colorScheme: scheme });

    test("чипы-фильтры: выбранный — aria-current, галочка и заливка не ниже 3:1 к невыбранному", async ({ page }) => {
      await page.goto("/a/clients?status=lead");
      const group = page.getByRole("group", { name: "Статус клиента" });
      const current = group.locator('a[aria-current="true"]');
      await expect(current, "выбран ровно один").toHaveCount(1);
      await expect(current).toContainText("Лиды");

      const others = group.locator("a:not([aria-current])");
      await expect(others).toHaveCount(2);

      // Форма, а не только цвет: галочка есть у выбранного и нет у остальных
      await expect(current.locator("svg")).toHaveCount(1);
      await expect(others.locator("svg")).toHaveCount(0);

      const on = await paint(page, current);
      const off = await paint(page, others.first());
      expect(ratio(on, off), `выбранный к невыбранному (${scheme})`).toBeGreaterThanOrEqual(3);
    });

    test("активная вкладка заливкой отличается от списка вкладок не ниже 3:1", async ({ page }) => {
      await page.goto("/a/vacancies/vac_1");
      const list = page.getByRole("tablist").first();
      const active = list.getByRole("tab", { selected: true });
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute("aria-selected", "true");

      const tab = await paint(page, active);
      const bar = await paint(page, list);
      expect(ratio(tab, bar), `активная вкладка к списку (${scheme})`).toBeGreaterThanOrEqual(3);
      // и текст на ней читается
      const text = await toRgb(page, await css(active, "color"));
      expect(ratio(text, tab)).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe("галочки и переключатели на мыши", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("сырая галочка своя, а не системная: appearance none, рамка --field, выбранная — заливка основным цветом", async ({ page }) => {
    await page.goto("/a/settings");
    const boxes = page.locator('main input[type="checkbox"]');
    expect(await boxes.count(), "в настройках уведомлений есть галочки").toBeGreaterThan(0);
    const probe = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = (el: Element) => {
        const cs = getComputedStyle(el);
        return { appearance: cs.appearance, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, checked: (el as HTMLInputElement).checked };
      };
      const all = [...document.querySelectorAll('main input[type="checkbox"]')].filter((e) => e.getBoundingClientRect().width > 0).map(read);
      return { coarse: matchMedia("(pointer: coarse)").matches, all, primary: root.getPropertyValue("--primary") };
    });
    expect(probe.coarse).toBe(false);
    expect(new Set(probe.all.map((c) => c.appearance))).toEqual(new Set(["none"]));
    expect(new Set(probe.all.map((c) => c.border))).toEqual(new Set(["1px"]));
    const checked = probe.all.find((c) => c.checked);
    expect(checked, "в настройках есть отмеченная галочка").toBeTruthy();
    expect(checked!.bg).toBe("rgb(84, 110, 136)");
  });

  test("переключатель в окне «Посадить в вакансию» — тоже свой круг с точкой", async ({ page }) => {
    await page.goto("/a/candidates/cand_1");
    await page.getByRole("button", { name: "Посадить в вакансию" }).click();
    const radio = page.getByRole("dialog").locator('input[type="radio"]:not(:disabled)').first();
    await radio.check();
    const probe = await radio.evaluate((el) => {
      const cs = getComputedStyle(el);
      const dot = getComputedStyle(el, "::after");
      return { appearance: cs.appearance, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, dot: dot.content, dotBg: dot.backgroundColor, w: cs.width };
    });
    expect(probe.appearance).toBe("none");
    expect(parseFloat(probe.radius)).toBeGreaterThan(8);
    expect(probe.bg).toBe("rgb(84, 110, 136)");
    expect(probe.dot).not.toBe("none");
  });
});

test.describe("наведение на поле", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("рамка поля усиливается под курсором; в фокусе остаётся цветом кольца", async ({ page }) => {
    await page.goto("/a/vacancies");
    const input = page.locator('[data-slot="list-search"] input');
    await page.mouse.move(2, 2);
    const idle = await css(input, "border-top-color");

    await input.hover();
    // У поля transition-colors: ждём, пока цвет дойдёт до конца, а не ловим промежуточный кадр
    await page.waitForTimeout(400);
    const hovered = await css(input, "border-top-color");
    expect(hovered).not.toBe(idle);
    const [ir, ig, ib] = await toRgb(page, idle);
    const [hr, hg, hb] = await toRgb(page, hovered);
    // Светлая тема: рамка темнее
    expect(hr + hg + hb).toBeLessThan(ir + ig + ib);

    // В фокусе рамку красит кольцо; наведение его не перебивает
    await input.focus();
    await page.waitForTimeout(400);
    const ring = await toRgb(page, await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ring")));
    expect(await toRgb(page, await css(input, "border-top-color")), "в фокусе под курсором — цвет кольца").toEqual(ring);
  });

  test("выпадающий список реагирует так же, как поле", async ({ page }) => {
    await page.goto("/a/vacancies");
    const select = page.locator('[data-slot="select-trigger"]').first();
    await page.mouse.move(2, 2);
    const idle = await css(select, "border-top-color");
    await select.hover();
    await expect.poll(() => css(select, "border-top-color")).not.toBe(idle);
  });
});

test.describe("ожидание списка", () => {
  test("после ввода в поиск — индикатор у поля и aria-busy на списке, потом «Список обновлён»", async ({ page }) => {
    await page.goto("/a/vacancies", { waitUntil: "networkidle" });

    // Сервер отвечает не сразу: страница списка приходит запросом RSC
    await page.route(/_rsc=/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    const live = page.locator('[data-slot="list-live"]');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveText("");

    await page.locator('[data-slot="list-search"] input').fill("Тов");

    const pending = page.locator('[data-slot="list-search-pending"]');
    await expect(pending).toBeVisible({ timeout: 4000 });
    await expect(page.locator('[data-slot="list-region"]').first()).toHaveAttribute("aria-busy", "true");

    // Ответ пришёл: индикатор и aria-busy ушли, читалке сказано один раз
    await expect(pending).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-slot="list-region"][aria-busy="true"]')).toHaveCount(0);
    await expect(live).toHaveText("Список обновлён");
  });
});

test.describe("фокус после окна", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("«Посадить в вакансию»: Escape возвращает фокус на кнопку", async ({ page }) => {
    await page.goto("/a/candidates/cand_1");
    const opener = page.getByRole("button", { name: "Посадить в вакансию" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("«+ Задание» в календаре: Escape возвращает фокус на кнопку", async ({ page }) => {
    await page.goto("/a/calendar");
    const opener = page.getByRole("button", { name: "+ Задание" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
