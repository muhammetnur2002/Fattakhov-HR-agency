/** То же правило шести ступеней, но для кабинета клиента (см. typography.spec.ts). */
import { expect, test } from "@playwright/test";

import { LAPTOP_SIZES, MAX_SIZES_PER_PAGE, PHONE_SIZES, visibleFontSizes } from "./fixtures/type-scale";

const PAGES = [
  "/dashboard", "/vacancies", "/vacancies/vac_1", "/vacancies/new", "/candidates", "/calendar", "/messages",
  "/documents", "/company", "/analytics", "/settings", "/help",
];

const VIEWPORTS = [
  { name: "ноутбук", viewport: { width: 1280, height: 800 }, allowed: LAPTOP_SIZES, touch: false },
  { name: "телефон", viewport: { width: 390, height: 844 }, allowed: PHONE_SIZES, touch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`шкала текста клиента: ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.touch, hasTouch: vp.touch });

    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        const sizes = await visibleFontSizes(page);

        expect(sizes.length, `размеры на странице: ${sizes.join(", ")}`).toBeLessThanOrEqual(MAX_SIZES_PER_PAGE);
        const stray = sizes.filter((s) => !vp.allowed.includes(s));
        expect(stray, `размеры вне шкалы (${vp.allowed.join(", ")}): ${stray.join(", ")}`).toEqual([]);
      });
    }
  });
}
