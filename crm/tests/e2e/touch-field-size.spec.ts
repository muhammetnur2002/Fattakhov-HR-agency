import { expect, test } from "@playwright/test";

import { fieldFontSizes } from "./fixtures/touch-fields";

/**
 * Поля ввода на телефоне — не мельче 16px.
 *
 * Иначе Safari на iPhone при фокусе увеличивает страницу, и форму
 * приходится сводить пальцами обратно. Эмуляция сенсорного экрана
 * (hasTouch + isMobile даёт `pointer: coarse`) в Chromium; сам zoom Safari
 * тут не воспроизвести, но условие, от которого он зависит, — размер
 * вычисленного шрифта — меряется напрямую.
 *
 * Сайт шкалой на телефоне даёт 15px (--text-base), кабинет — 14px у полей с
 * собственным text-sm (поиск в шапке, select в формах). Правило в
 * globals.css одно на все поля и держит 16px.
 */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

async function expectFieldsAtLeast16(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const fields = await fieldFontSizes(page);
  expect(fields.length, `на ${path} не нашлось ни одного поля — тест ничего не проверяет`).toBeGreaterThan(0);
  const small = fields.filter((f) => f.size < 16);
  expect(small, `${path}: поля мельче 16px — ${small.map((f) => `${f.field} ${f.size}px`).join(", ")}`).toEqual([]);
}

test.describe("сайт", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/", "/tariffs"]) {
    test(`${path}: заявка, калькулятор, подписка — 16px`, async ({ page }) => {
      await expectFieldsAtLeast16(page, path);
    });
  }

  test("/audit: форма заявки после опросника — 16px", async ({ page }) => {
    await page.addInitScript(() => {
      const answers: Record<number, number> = {};
      for (let i = 1; i <= 12; i++) answers[i] = 1;
      localStorage.setItem("fhr-audit-v1", JSON.stringify(answers));
    });
    await expectFieldsAtLeast16(page, "/audit");
  });

  test("остальная шкала сайта на телефоне не тронута: 15px у основного текста", async ({ page }) => {
    await page.goto("/");
    const bodySize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".marketing-shell")!).fontSize));
    expect(bodySize).toBe(15);
  });
});

test.describe("кабинет агентства", () => {
  for (const path of ["/a/search", "/a/candidates"]) {
    test(`${path}: поиск и фильтры — 16px`, async ({ page }) => {
      await expectFieldsAtLeast16(page, path);
    });
  }

  test("запись гарантийного случая: причина — 16px", async ({ page }) => {
    // Нанятый с действующей гарантией есть в seed (BR-10): app_23
    await page.goto("/a/applications/app_23");
    const reason = page.locator("select[name=reason]");
    await expect(reason, "в seed у app_23 должна быть открытая гарантия").toBeVisible();
    const size = await reason.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
