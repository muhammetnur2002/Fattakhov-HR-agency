import { expect, test } from "@playwright/test";

import { cleanupDraftVacancies } from "./fixtures/db-client";

/**
 * Мастер заявки у клиента: «Назад» браузера возвращает на прошлый шаг мастера, а не уводит
 * из него целиком; число человек проверяется до перехода дальше.
 */
test.afterEach(async () => {
  // Мастер сохраняет черновик сам — убираем его, чтобы он не копился с каждым прогоном
  await cleanupDraftVacancies({ titlePrefix: "E2E Мастер шагов" });
});

test("мастер заявки: шаг в адресе, «Назад» браузера и проверка числа человек", async ({ page }) => {
  await page.goto("/vacancies/new");
  await page.waitForFunction(() => {
    const el = document.querySelector("#title");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  await page.locator("#title").fill("E2E Мастер шагов");

  // Очищенное число человек останавливает «Далее» и называется по имени
  await page.locator("#headcount").fill("");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText(/Сколько человек нужно: укажите число от 1 до 500/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Назад" })).toHaveCount(0);

  await page.locator("#headcount").fill("3");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  await expect(page).toHaveURL(/step=2/);

  // «Назад» браузера — на шаг 1 мастера, а не прочь со страницы
  await page.goBack();
  await expect(page).toHaveURL(/\/vacancies\/new/);
  await expect(page.locator("#title")).toBeVisible();
  await expect(page.getByRole("button", { name: "Назад" })).toHaveCount(0);

  // «Вперёд» браузера — снова шаг 2, введённое на месте
  await page.goForward();
  await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.locator("#title")).toHaveValue("E2E Мастер шагов");
});
