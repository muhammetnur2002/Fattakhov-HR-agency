/**
 * Страницы входа и регистрации: не больше шести размеров, и на телефоне — только из
 * шкалы 12/14/16/18/24/36.
 *
 * Сверка 08.10.2026: typography.spec.ts входа не касался, а там заголовок карточки был
 * text-xl — 20px на телефоне, вне шкалы. На ноутбуке у страниц входа шкала Tailwind
 * от корня 125% (17.5/20/25/30…), не кабинетная, поэтому там проверяется только число.
 */
import { expect, test } from "@playwright/test";

import { MAX_SIZES_PER_PAGE, PHONE_SIZES, visibleFontSizes } from "./fixtures/type-scale";

test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ["/login", "/register", "/forgot"];

for (const path of PAGES) {
  test(`вход, телефон: ${path}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(path, { waitUntil: "networkidle" });
    const sizes = await visibleFontSizes(page);
    expect(sizes.length, `размеры: ${sizes.join(", ")}`).toBeLessThanOrEqual(MAX_SIZES_PER_PAGE);
    expect(sizes.filter((s) => !PHONE_SIZES.includes(s)), `вне шкалы ${PHONE_SIZES.join("/")}: ${sizes.join(", ")}`).toEqual([]);
    await ctx.close();
  });

  test(`вход, ноутбук: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path, { waitUntil: "networkidle" });
    const sizes = await visibleFontSizes(page);
    expect(sizes.length, `размеры: ${sizes.join(", ")}`).toBeLessThanOrEqual(MAX_SIZES_PER_PAGE);
  });
}
