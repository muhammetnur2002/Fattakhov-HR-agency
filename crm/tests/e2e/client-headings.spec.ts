/** Структура заголовков страниц клиента — см. headings.spec.ts. */
import { test } from "@playwright/test";

import { expectSoundOutline, headingOutline } from "./fixtures/headings";

const PAGES = [
  "/dashboard", "/vacancies", "/vacancies/vac_1", "/vacancies/new", "/candidates", "/calendar", "/messages",
  "/documents", "/company", "/analytics", "/settings", "/help", "/notifications", "/search",
  "/students", "/students/applications", "/students/candidates", "/students/new",
];

for (const path of PAGES) {
  test(`заголовки клиента: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expectSoundOutline(await headingOutline(page));
  });
}
