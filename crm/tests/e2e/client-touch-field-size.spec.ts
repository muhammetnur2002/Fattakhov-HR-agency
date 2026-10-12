import { expect, test } from "@playwright/test";

import { fieldFontSizes } from "./fixtures/touch-fields";

/**
 * Кабинет клиента на телефоне: поля ввода не мельче 16px (см. touch-field-size.spec.ts).
 * Поиск по кабинету и список ролей в приглашении сидели на собственном text-sm — 14px.
 */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

for (const path of ["/search", "/settings", "/company"]) {
  test(`${path}: поля — 16px`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const fields = await fieldFontSizes(page);
    expect(fields.length, `на ${path} не нашлось ни одного поля`).toBeGreaterThan(0);
    const small = fields.filter((f) => f.size < 16);
    expect(small, small.map((f) => `${f.field} ${f.size}px`).join(", ")).toEqual([]);
  });
}
