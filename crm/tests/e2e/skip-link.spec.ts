/**
 * «Перейти к содержимому»: первый Tab попадает на ссылку, Enter переносит фокус в main.
 *
 * Раньше до страницы приходилось пролистывать всю шапку и меню (8–19 нажатий Tab, замер
 * 11.10.2026). Ссылка появляется плашкой ПОД липкой шапкой, а не поверх неё. Кабинет
 * клиента — client-skip-link.spec.ts.
 */
import { expect, test, type Page } from "@playwright/test";

import { focused } from "./fixtures/a11y";

/**
 * stickyHeader — липкая шапка оболочки: плашка встаёт ниже неё.
 * aboveLogo — у страниц входа шапки нет, есть знак по центру: плашка над ним.
 */
async function skipToMain(page: Page, { stickyHeader, aboveLogo }: { stickyHeader?: string; aboveLogo?: string }) {
  await page.keyboard.press("Tab");
  const link = page.getByRole("link", { name: "Перейти к содержимому" });
  await expect(link, "первый Tab — на ссылку").toBeFocused();

  // Плашка видна целиком и не закрывает шапку
  const box = (await link.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(40);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  if (stickyHeader) {
    const bar = (await page.locator(stickyHeader).first().boundingBox())!;
    expect(box.y, "плашка не заходит на шапку").toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  }
  if (aboveLogo) {
    const logo = (await page.locator(aboveLogo).first().boundingBox())!;
    expect(box.y + box.height, "плашка не закрывает знак").toBeLessThanOrEqual(logo.y + 1);
  }

  await page.keyboard.press("Enter");
  await expect(page.locator("main"), "Enter переносит фокус в main").toBeFocused();

  // Следующий Tab идёт внутрь страницы, а не обратно в шапку
  await page.keyboard.press("Tab");
  const next = await focused(page);
  expect(next?.inMain, `после перехода Tab попал в ${JSON.stringify(next)}`).toBe(true);
}

test("кабинет агентства", async ({ page }) => {
  await page.goto("/a/vacancies");
  await skipToMain(page, { stickyHeader: "[data-app-header]" });
});

test.describe("без входа", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Вход, восстановление и приглашение сразу ставят курсор в первое поле (autoFocus):
  // там ссылка достижима Shift+Tab, а первый Tab идёт к следующему полю. Регистрация без автофокуса
  test("страница регистрации", async ({ page }) => {
    await page.goto("/register");
    await skipToMain(page, { aboveLogo: "main header, body header" });
  });

  test("сайт: плашка встаёт под липкой шапкой", async ({ page }) => {
    await page.goto("/tariffs");
    await skipToMain(page, { stickyHeader: "body > div > header" });
  });
});
