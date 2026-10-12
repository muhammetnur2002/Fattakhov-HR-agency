/** «Перейти к содержимому» в кабинете клиента (агентство, вход и сайт — skip-link.spec.ts). */
import { expect, test } from "@playwright/test";

import { focused } from "./fixtures/a11y";

test("кабинет клиента: первый Tab — на ссылку, Enter — в main, дальше Tab внутрь страницы", async ({ page }) => {
  await page.goto("/vacancies");
  await page.keyboard.press("Tab");
  const link = page.getByRole("link", { name: "Перейти к содержимому" });
  await expect(link).toBeFocused();

  const box = (await link.boundingBox())!;
  const header = (await page.locator("[data-app-header]").boundingBox())!;
  expect(box.y, "плашка не заходит на шапку").toBeGreaterThanOrEqual(header.y + header.height - 1);

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.keyboard.press("Tab");
  expect((await focused(page))?.inMain).toBe(true);
});
