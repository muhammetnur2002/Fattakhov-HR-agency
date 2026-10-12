/**
 * Поиск в кабинете агентства: длиннее минимум в полтора раза и одной длины в каждом разделе.
 *
 * Сверка по скриншотам заказчика: поле в шапке — 320 точек, подсказка обрезалась на слове
 * «кандидат»; поля списков — 283 / 400 / 480 в разных разделах, а в ряду с фильтрами сжимались
 * до содержимого. Меряем в настоящем браузере на 768, 1024, 1280, 1440 и на телефоне 375:
 * ширина совпадает у всех списков, подсказка влезает, страница не уезжает вбок.
 */
import { expect, test } from "@playwright/test";

import { expectSearch, measureSearch } from "./fixtures/search";

// Заявки с сайта и клиенты — только у владельца и аккаунт-менеджера
test.use({ storageState: "tests/e2e/.auth/owner.json" });

const PAGES = ["/a/vacancies", "/a/clients", "/a/leads", "/a/candidates"];

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

    test("поле поиска одной ширины во всех списках, подсказка влезает, вбок не уезжает", async ({ page }) => {
      const lists: number[] = [];
      const headers: number[] = [];
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: "networkidle" });
        const m = await measureSearch(page);
        expectSearch(m, screen.width);
        // одно поле поиска на страницу, и его ширина одна на все разделы
        expect(m.lists, path).toHaveLength(1);
        lists.push(m.lists[0].width);
        if (m.header !== null) headers.push(m.header);
      }
      expect(Math.max(...lists) - Math.min(...lists), `ширины полей списков: ${lists.join(", ")}`).toBeLessThanOrEqual(1);
      if (headers.length) {
        expect(Math.max(...headers) - Math.min(...headers), `ширины шапки: ${headers.join(", ")}`).toBeLessThanOrEqual(1);
      }
    });
  });
}

test("на странице результатов поиска поле той же ширины, что и в списках", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/a/search?q=а", { waitUntil: "networkidle" });
  const box = page.locator("main form").first();
  const width = (await box.boundingBox())!.width;
  expect(Math.abs(width - 720)).toBeLessThanOrEqual(1);
});
