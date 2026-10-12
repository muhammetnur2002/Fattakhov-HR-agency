/**
 * Поиск в кабинете клиента: тот же порядок, что у агентства (search-width.spec.ts) —
 * поля списков вакансий и кандидатов одной ширины и не короче чем в полтора раза,
 * поле в шапке не уже 1,5 от прежнего, подсказка влезает, вбок не уезжает.
 */
import { expect, test } from "@playwright/test";

import { expectSearch, measureSearch } from "./fixtures/search";

const PAGES = ["/vacancies", "/candidates"];

const SCREENS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 375, height: 812, phone: true },
];

for (const screen of SCREENS) {
  test.describe(`экран ${screen.width}`, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      isMobile: Boolean(screen.phone),
      hasTouch: Boolean(screen.phone),
    });

    test("поле поиска одной ширины в списках вакансий и кандидатов", async ({ page }) => {
      const widths: number[] = [];
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: "networkidle" });
        const m = await measureSearch(page);
        expectSearch(m, screen.width);
        expect(m.lists, path).toHaveLength(1);
        widths.push(m.lists[0].width);
      }
      expect(Math.abs(widths[0] - widths[1]), `ширины: ${widths.join(", ")}`).toBeLessThanOrEqual(1);
    });
  });
}
