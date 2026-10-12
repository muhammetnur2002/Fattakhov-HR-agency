import { expect, test } from "@playwright/test";

/** То же для календаря агентства (см. client-calendar-subscription.spec.ts). */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test("календарь агентства: карточка подписки помещается в 375px", async ({ page }) => {
  await page.goto("/a/calendar");
  await page.getByRole("button", { name: "Подписаться на календарь" }).click();

  const copy = page.getByRole("button", { name: "Копировать" });
  await expect(copy).toBeVisible();

  const m = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(m.viewport).toBe(375);
  expect(m.scrollWidth).toBeLessThanOrEqual(375);
  const box = (await copy.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
