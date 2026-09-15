import { test, expect } from "@playwright/test";

/**
 * Вход в платформу.
 *
 * Файл нарочно не использует сохранённую сессию (см. auth.setup.ts) —
 * ему как раз нужно быть неавторизованным, чтобы проверить саму форму,
 * а не то, что происходит после неё.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("верный пароль ведёт в кабинет", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("rec1@fattakhov.hr");
  await page.locator("#password").fill("demo1234");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/a/);
});

test("неверный пароль — общая ошибка, без намёка на то, что сломалось", async ({
  page,
}) => {
  /*
    Проверяет BR-28-подобное правило из auth.ts: сообщение об ошибке
    одно на все случаи (неверный email, неверный пароль, отключённая
    учётка). Форма входа не должна становиться инструментом проверки,
    какие адреса заведены в системе.
  */
  await page.goto("/login");
  await page.locator("#email").fill("rec1@fattakhov.hr");
  await page.locator("#password").fill("совсем-не-тот-пароль");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText("Неверный email или пароль")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("несуществующий email — та же самая ошибка", async ({ page }) => {
  // Адрес нарочно ASCII: type="email" в браузере проверяет формат
  // до всякой отправки, и кириллица в локальной части (например
  // "такого-нет@...") эту проверку не проходит — форма молча не
  // отправится, и тест будет падать не на том, что проверяет
  await page.goto("/login");
  await page.locator("#email").fill("no-such-user@fattakhov.hr");
  await page.locator("#password").fill("demo1234");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText("Неверный email или пароль")).toBeVisible();
});

test("анонима со страницы кабинета уводит на вход", async ({ page }) => {
  await page.goto("/a/candidates");
  await expect(page).toHaveURL(/\/login/);
});
