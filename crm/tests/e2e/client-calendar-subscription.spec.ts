import { expect, test } from "@playwright/test";

/**
 * Подписка на календарь на телефоне: карточка не шире экрана.
 *
 * Длинный адрес без пробелов растягивал карточку (она стоит во flex-строке
 * заголовка), и «Копировать» уезжало за край: страница получала прокрутку
 * вбок, а в мобильном Chrome ещё и сжималась до масштаба «всё на экране».
 */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test("карточка помещается в 375px, «Копировать» на экране, прокрутки вбок нет", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Подписаться на календарь" }).click();

  const copy = page.getByRole("button", { name: "Копировать" });
  await expect(copy).toBeVisible();

  const m = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(m.viewport, "страница расширилась за экран").toBe(375);
  expect(m.scrollWidth, "есть прокрутка вбок").toBeLessThanOrEqual(375);

  const box = (await copy.boundingBox())!;
  expect(box.x + box.width, "«Копировать» за правым краем").toBeLessThanOrEqual(375);
  expect(box.x).toBeGreaterThanOrEqual(0);
});

test("адрес виден целиком: переносится, а не обрезается", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Подписаться на календарь" }).click();
  const code = page.locator("code", { hasText: "/api/calendar" });
  const clipped = await code.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, "адрес обрезан многоточием").toBe(false);
});
