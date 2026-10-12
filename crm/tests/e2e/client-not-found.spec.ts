import { expect, test } from "@playwright/test";

/** То же в кабинете клиента: чужой или несуществующий объект — 404 с меню (BR-28 не нарушен). */
test("несуществующая вакансия у клиента: 404 внутри кабинета, меню на месте", async ({ page }) => {
  await page.goto("/vacancies/does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
  await page.getByRole("link", { name: "К списку вакансий" }).click();
  await expect(page).toHaveURL(/\/vacancies$/);
});
