/**
 * Не больше шести размеров шрифта на странице, и только из шкалы.
 *
 * Замер 07.10.2026 (25 страниц обоих кабинетов): на телефоне до 9 разных
 * размеров, на ноутбуке стабильно лишние 11px в боковой панели. Источники —
 * несколько произвольных `text-[10px]`, `text-[0.8rem]` и одна плитка не
 * того размера; заказчик называла это «кучей разных размеров на одной
 * вкладке». Тест держит результат: новая страница или новая подпись с
 * лишним размером упадёт здесь, а не на глазах у человека.
 *
 * Агентство (владелец) — здесь; клиент — client-typography.spec.ts.
 */
import { expect, test } from "@playwright/test";

import { LAPTOP_SIZES, MAX_SIZES_PER_PAGE, PHONE_SIZES, visibleFontSizes } from "./fixtures/type-scale";

// Под владельцем: /a/leads и /a/analytics рекрутёру недоступны (404 вне кабинета)
test.use({ storageState: "tests/e2e/.auth/owner.json" });

const PAGES = [
  "/a", "/a/vacancies", "/a/vacancies/vac_1", "/a/vacancies/new", "/a/candidates", "/a/leads", "/a/clients",
  "/a/messages", "/a/calendar", "/a/analytics", "/a/settings", "/a/help", "/a/notifications",
];

const VIEWPORTS = [
  { name: "ноутбук", viewport: { width: 1280, height: 800 }, allowed: LAPTOP_SIZES, touch: false },
  { name: "телефон", viewport: { width: 390, height: 844 }, allowed: PHONE_SIZES, touch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`шкала текста: ${vp.name}`, () => {
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
