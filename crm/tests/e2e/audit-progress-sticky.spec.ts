import { expect, test } from "@playwright/test";

/**
 * Полоса прогресса на /audit прилипает к верху.
 *
 * Раздел сайта был с `overflow: hidden` — он становился контейнером
 * прокрутки, и `position: sticky` внутри прилипал к разделу, а не к окну:
 * полоса уезжала вместе со страницей. Теперь раздел режет по `overflow: clip`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

for (const [name, viewport] of [
  ["ноутбук", { width: 1280, height: 800 }],
  ["телефон", { width: 375, height: 812 }],
] as const) {
  test(`${name}: при прокрутке полоса остаётся у верха под шапкой`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");

    const bar = page.locator("div.sticky").filter({ hasText: /Пройдено|Аудит пройден/ }).first();
    const toolTop = await page.evaluate(() => document.querySelector("#tool")!.getBoundingClientRect().top + scrollY);
    // Высота шапки сайта — токен, на телефоне 4rem, на ноутбуке 125% от неё
    const headerBottom = await page.evaluate(() => {
      const header = document.querySelector("header");
      return header ? Math.round(header.getBoundingClientRect().bottom) : 0;
    });

    const tops: number[] = [];
    for (const dy of [600, 1500, 2600]) {
      await page.evaluate((y) => scrollTo(0, y), toolTop + dy);
      await page.waitForTimeout(150);
      tops.push(await bar.evaluate((el) => Math.round(el.getBoundingClientRect().top)));
    }

    // Все три замера одинаковы и не уехали за верх экрана
    expect(new Set(tops).size, `полоса прыгает: ${tops.join(", ")}`).toBe(1);
    expect(tops[0]).toBeGreaterThanOrEqual(0);
    expect(tops[0]).toBeLessThanOrEqual(headerBottom + 2);
  });
}

test("раздел режет лишнее клипом, а не прокруткой", async ({ page }) => {
  await page.goto("/audit");
  const overflow = await page.evaluate(() => getComputedStyle(document.querySelector("#tool")!).overflow);
  expect(overflow).toBe("clip");
});
