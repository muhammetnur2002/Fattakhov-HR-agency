import { expect, test } from "@playwright/test";

/**
 * Меню сайта в горизонтальном телефоне (667×375): «Обсудить найм» остаётся на экране,
 * а список разделов прокручивается внутри шторки. Раньше кнопка уезжала ниже экрана без подсказки.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 667, height: 375 }, hasTouch: true });

test("меню в горизонтали: кнопка «Обсудить найм» и вход видны без прокрутки шторки", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => {
    const el = document.querySelector('button[aria-label="Открыть меню"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  for (const name of ["Обсудить найм", "Войти в кабинет"]) {
    const box = await dialog.getByRole("link", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y + box!.height, `${name} целиком на экране`).toBeLessThanOrEqual(375);
  }

  // Список разделов не вытесняет кнопки: прокручивается сам
  const nav = dialog.getByRole("navigation", { name: "Разделы сайта" });
  const { scrollable, bottom } = await nav.evaluate((el) => ({
    scrollable: el.scrollHeight >= el.clientHeight,
    bottom: el.getBoundingClientRect().bottom,
  }));
  expect(scrollable).toBe(true);
  const cta = await dialog.getByRole("link", { name: "Обсудить найм" }).boundingBox();
  expect(bottom).toBeLessThanOrEqual(cta!.y + 1);
});
