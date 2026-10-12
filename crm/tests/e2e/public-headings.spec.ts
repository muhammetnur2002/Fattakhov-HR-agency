/**
 * Публичные страницы: у каждой свой h1. На входе, регистрации и восстановлении
 * заголовком был h2 карточки — страница начиналась с «второго уровня».
 */
import { test } from "@playwright/test";

import { expectSoundOutline, headingOutline } from "./fixtures/headings";

test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ["/login", "/register", "/forgot", "/privacy"]) {
  test(`заголовки: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expectSoundOutline(await headingOutline(page));
  });
}
