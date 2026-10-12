/**
 * Структура заголовков страниц агентства: один h1, он первый, уровни без
 * прыжков. Сверка 08.10.2026 нашла страницы без h1 (вход, регистрация,
 * /a/clients/new, политика) и заголовок h2 раньше h1.
 * Клиент — client-headings.spec.ts, публичные страницы — public-headings.spec.ts.
 */
import { test } from "@playwright/test";

import { expectSoundOutline, headingOutline } from "./fixtures/headings";

// Под владельцем: часть разделов рекрутёру недоступна
test.use({ storageState: "tests/e2e/.auth/owner.json" });

const PAGES = [
  "/a", "/a/vacancies", "/a/vacancies/vac_1", "/a/vacancies/new", "/a/candidates", "/a/candidates/new",
  "/a/leads", "/a/clients", "/a/clients/new", "/a/clients/funnel", "/a/clients/link-requests",
  "/a/messages", "/a/calendar", "/a/analytics", "/a/finance", "/a/team",
  "/a/settings", "/a/settings/pdn", "/a/settings/auth-log", "/a/help", "/a/notifications", "/a/search",
  "/a/reviews", "/a/reviews/students", "/a/reviews/study", "/a/reviews/moderation", "/a/reviews/pilot",
];

for (const path of PAGES) {
  test(`заголовки: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expectSoundOutline(await headingOutline(page));
  });
}
