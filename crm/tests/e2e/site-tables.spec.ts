import { expect, test } from "@playwright/test";

/**
 * Таблицы сайта на телефоне. Раньше три колонки текста в 36–42rem прокручивались вбок,
 * и видна была половина таблицы без связи строки с её названием.
 */
test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ["/audit", "/privacy"]) {
  test(`${path}: на телефоне таблицы без прокрутки вбок, на широком экране остаются таблицами`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    const phone = await page.evaluate(() =>
      [...document.querySelectorAll("table")].map((t) => ({
        display: getComputedStyle(t).display,
        overflow: t.scrollWidth > t.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
      })),
    );
    expect(phone.length).toBeGreaterThan(0);
    for (const t of phone) {
      expect(t.display).toBe("block");
      expect(t.overflow).toBe(false);
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    const wide = await page.evaluate(() => [...document.querySelectorAll("table")].map((t) => getComputedStyle(t).display));
    expect(new Set(wide)).toEqual(new Set(["table"]));
  });
}

test("сравнение на главной: колонка названий остаётся на месте при сдвиге вбок", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const label = page.getByText("Штатный рекрутер").first();
  const scroller = label.locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
  await scroller.scrollIntoViewIfNeeded();
  const firstLabelCell = scroller.locator("div.sticky").nth(1);
  const before = await firstLabelCell.boundingBox();
  await scroller.evaluate((el) => (el.scrollLeft = 150));
  const after = await firstLabelCell.boundingBox();
  const left = await scroller.evaluate((el) => el.getBoundingClientRect().left);
  expect(before).not.toBeNull();
  expect(Math.abs(after!.x - left)).toBeLessThan(2);
});
