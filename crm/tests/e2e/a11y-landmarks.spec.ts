/**
 * Ориентиры страниц: один main, подписанные nav, шапка и подвал на публичных страницах.
 * Раньше у входа и регистрации не было ни одного ориентира, а навигации в списке
 * читалки назывались одинаково безымянно (проверка 11.10.2026). Кабинет клиента —
 * client-a11y-landmarks.spec.ts.
 */
import { expect, test } from "@playwright/test";

import { expectLandmarks } from "./fixtures/a11y";

test.describe("кабинет агентства", () => {
  for (const path of ["/a", "/a/vacancies", "/a/messages", "/a/settings", "/a/applications/does-not-exist"]) {
    test(`${path}: один main, навигации названы`, async ({ page }) => {
      await page.goto(path);
      await expectLandmarks(page);
    });
  }
});

test.describe("публичные страницы", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/login", "/register", "/forgot"]) {
    test(`${path}: шапка, один main и подвал`, async ({ page }) => {
      await page.goto(path);
      await expectLandmarks(page, { footer: true });
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }
});

test.describe("сайт", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/", "/tariffs", "/audit", "/privacy", "/cases"]) {
    test(`${path}: один main, меню сайта названо`, async ({ page }) => {
      await page.goto(path);
      await expectLandmarks(page, { footer: true });
      await expect(page.getByRole("navigation", { name: "Разделы сайта" })).toBeVisible();
    });
  }

  test("таблицы сайта подписаны, заголовки столбцов с scope", async ({ page }) => {
    for (const path of ["/privacy", "/audit"]) {
      await page.goto(path);
      const tables = await page.evaluate(() =>
        [...document.querySelectorAll("table")].map((t) => ({
          caption: (t.querySelector("caption")?.textContent ?? "").trim(),
          badHeads: [...t.querySelectorAll("th")].filter((th) => th.getAttribute("scope") !== "col").length,
        })),
      );
      expect(tables.length, path).toBeGreaterThan(0);
      for (const t of tables) {
        expect(t.caption, `${path}: подпись таблицы`).not.toBe("");
        expect(t.badHeads, `${path}: заголовки без scope`).toBe(0);
      }
    }
  });

  test("прокручиваемая таблица сравнения на главной: на узком экране в порядке Tab, с именем", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const region = page.getByRole("region", { name: /Сравнение: штатный рекрутер/ });
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveAttribute("tabindex", "0");
    await region.focus();
    // Стрелка вправо с клавиатуры двигает таблицу
    const before = await region.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
    // Сама таблица размечена: заголовки столбцов и строк
    expect(await region.getByRole("columnheader").count()).toBeGreaterThanOrEqual(3);
    expect(await region.getByRole("rowheader").count()).toBeGreaterThanOrEqual(3);
  });

  test("на широком экране таблица помещается — лишней остановки Tab нет", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/privacy");
    await expect(page.getByRole("region", { name: /Категории субъектов/ })).toHaveCount(0);
  });
});
