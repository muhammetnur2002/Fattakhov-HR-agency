import { expect, test } from "@playwright/test";

import { visibleFontSizes } from "./fixtures/type-scale";

/**
 * Живые страницы сайта укладываются в шкалу «шесть текстовых ступеней плюс акцентная»
 * (globals.css, .marketing-shell): на странице не больше шести размеров, а на главной —
 * семь, потому что акцент (главный заголовок и цена первого экрана) только там.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const LAPTOP = [15, 18, 22, 30, 45, 60, 100];
const PHONE = [12, 15, 18, 22, 28, 36, 48];

for (const [name, viewport, allowed] of [
  ["ноутбук", { width: 1440, height: 900 }, LAPTOP],
  ["телефон", { width: 375, height: 800 }, PHONE],
] as const) {
  for (const path of ["/", "/tariffs", "/audit", "/cases", "/privacy"]) {
    test(`сайт, ${name}: ${path} в шкале`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await page.waitForTimeout(800);
      const sizes = await visibleFontSizes(page);
      const outside = sizes.filter((s) => !allowed.includes(s));
      expect(outside, `размеры вне шкалы: ${outside.join(", ")} (все: ${sizes.join(", ")})`).toEqual([]);
      const accent = allowed[allowed.length - 1];
      if (path === "/") expect(sizes.length).toBeLessThanOrEqual(7);
      else {
        expect(sizes.length, sizes.join(", ")).toBeLessThanOrEqual(6);
        expect(sizes, "акцент только на главной").not.toContain(accent);
      }
    });
  }
}
