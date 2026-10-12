/** Ориентиры страниц кабинета клиента: один main, подписанные nav (агентство — a11y-landmarks.spec.ts). */
import { test } from "@playwright/test";

import { expectLandmarks } from "./fixtures/a11y";

for (const path of ["/dashboard", "/vacancies", "/messages", "/settings", "/vacancies/does-not-exist"]) {
  test(`${path}: один main, навигации названы`, async ({ page }) => {
    await page.goto(path);
    await expectLandmarks(page);
  });
}
