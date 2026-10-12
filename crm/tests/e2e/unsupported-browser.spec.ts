import { expect, test } from "@playwright/test";

/**
 * Плашка «Обновите браузер» — открывается только там, где не хватает возможностей.
 *
 * Настоящий Safari 16.3 здесь не запустить, поэтому «устаревший браузер»
 * изображается так же, как он выглядит для страницы: нет CSS.supports для
 * color-mix и structuredClone. Скрипт проверки смотрит на возможности, а не на
 * User-Agent, — подмена возможностей и есть честная эмуляция. Что именно
 * Safari 16.3 не разбирает регулярные выражения с просмотром назад, из
 * Chromium не воспроизвести — это проверено только по документации.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("современный браузер: плашки нет", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#browser-notice")).toBeHidden();
});

test("не хватает возможностей: плашка видна, видны только нужные причины, гидратация цела", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "structuredClone", { value: undefined, configurable: true });
    const supports = CSS.supports.bind(CSS);
    CSS.supports = ((...args: string[]) =>
      String(args[args.length - 1]).includes("color-mix")
        ? false
        : supports(...(args as [string, string]))) as typeof CSS.supports;
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const notice = page.getByRole("region", { name: "Устаревший браузер" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Обновите браузер");
  await expect(notice.locator("li[data-missing=css]")).toBeVisible();
  await expect(notice.locator("li[data-missing=clone]")).toBeVisible();
  await expect(notice.locator("li[data-missing=js]")).toBeHidden();
  // Страница под плашкой на месте и гидратировалась: вставка узлов в разметку React ломала бы её
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors.filter((e) => /hydrat|script tag/i.test(e))).toEqual([]);

  await notice.getByRole("button", { name: "Понятно" }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(page.locator("#browser-notice")).toBeHidden();
});

test("страница входа тоже: плашка не привязана к сайту", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "structuredClone", { value: undefined, configurable: true });
  });
  await page.goto("/login");
  await expect(page.getByRole("region", { name: "Устаревший браузер" })).toBeVisible();
});

test.describe("кабинет", () => {
  test.use({ storageState: "tests/e2e/.auth/client-admin.json" });

  test("и в кабинете", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "structuredClone", { value: undefined, configurable: true });
    });
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Устаревший браузер" })).toBeVisible();
  });
});
