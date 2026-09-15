import { test as setup, expect } from "@playwright/test";

/**
 * Вход один раз на весь прогон — не в каждом тесте.
 *
 * Playwright сохраняет состояние сессии (куки) в файл и переиспользует
 * его в проектах chromium/chromium-client (см. playwright.config.ts).
 * Сам вход всё равно проверяется по-настоящему — если форма или сессия
 * сломаются, здесь это упадёт раньше и понятнее, чем в середине
 * произвольного теста.
 *
 * Пароль — demo1234, тот же, что и у всех учётных записей из seed
 * (prisma/seed.ts, DEV_PASSWORD). Это не чей-то личный пароль: строка
 * лежит в репозитории открытым текстом именно для такого использования —
 * seed идемпотентен и заново создаёт эти учётки при каждом прогоне
 * `npm run db:seed`.
 */
const DEV_PASSWORD = "demo1234";

async function login(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  // Обе стороны после входа уводят с формы: агентство на /a, клиента
  // на /dashboard. Ждём именно ухода с /login, а не конкретный адрес —
  // так сетап не знает лишнего о том, куда каждая роль попадает.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

setup("вход рекрутёром", async ({ page }) => {
  await login(page, "rec1@fattakhov.hr");
  await page.context().storageState({ path: "tests/e2e/.auth/recruiter.json" });
});

setup("вход администратором клиента", async ({ page }) => {
  await login(page, "hrd@starfish.ru");
  await page
    .context()
    .storageState({ path: "tests/e2e/.auth/client-admin.json" });
});

/**
 * Отдельная сессия владельца — единственная роль с comment.deleteAny
 * (lib/access/index.ts). Нужна только там, где сценарий именно про это
 * право: удаление чужого комментария, а не про рекрутёра или клиента.
 */
setup("вход владельцем агентства", async ({ page }) => {
  await login(page, "owner@fattakhov.hr");
  await page.context().storageState({ path: "tests/e2e/.auth/owner.json" });
});
