import { expect, test } from "@playwright/test";

/**
 * 404 внутри кабинета агентства: меню на месте. Раньше единственный корневой not-found
 * рисовался без оболочки, и человек оставался на пустой странице без навигации.
 */
test("несуществующая заявка у рекрутёра: 404 внутри кабинета, меню и кнопка к списку на месте", async ({ page }) => {
  await page.goto("/a/applications/does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
  await page.getByRole("link", { name: "К списку вакансий" }).click();
  await expect(page).toHaveURL(/\/a\/vacancies/);
});
