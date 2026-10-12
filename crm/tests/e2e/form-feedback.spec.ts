/**
 * Формы кабинета агентства: ошибки у полей и набранное после отказа сервера.
 *
 * Отказы схемы ничего не меняют в базе: аккаунт не создаётся, оффер не сохраняется.
 */
import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/owner.json" });

test("создание пользователя клиента: пароли не совпадают — ошибка у второго поля, имя и почта остались", async ({ page }) => {
  await page.goto("/a/clients/cl_starfish");
  const form = page
    .locator("form")
    .filter({ has: page.locator("input[name=passwordConfirm]") })
    .filter({ has: page.getByLabel("Имя и фамилия") })
    .first();
  await form.getByLabel("Почта").fill("anna@starfish");
  await form.getByLabel("Имя и фамилия").fill("Анна Петрова");
  await form.getByLabel("Пароль", { exact: true }).fill("длинная-фраза-для-пароля-77");
  await form.getByLabel("Пароль ещё раз").fill("совсем-другая-фраза-88");
  await form.getByRole("button", { name: "Создать аккаунт" }).click();

  // Адрес без точки пройдёт HTML5, но не схему: ошибка у почты, она и получает фокус
  await expect(form.getByLabel("Почта")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Почта")).toBeFocused();
  await expect(form.getByLabel("Пароль ещё раз")).toHaveAttribute("aria-invalid", "true");
  await expect(form).toContainText("Пароли не совпадают");

  // Прежде всё стиралось: React 19 очищал форму после любого ответа сервера
  await expect(form.getByLabel("Имя и фамилия")).toHaveValue("Анна Петрова");
  await expect(form.getByLabel("Почта")).toHaveValue("anna@starfish");
  await expect(form.getByLabel("Пароль", { exact: true })).toHaveValue("длинная-фраза-для-пароля-77");
});

test("оффер: слишком большая сумма — у поля суммы, должность осталась", async ({ page }) => {
  await page.goto("/a/applications/app_22");
  const form = page.locator("form").filter({ has: page.locator("input[name=salary]") }).first();
  await form.locator("input[name=salary]").fill("150000000");
  await form.locator("input[name=position]").fill("Менеджер по продажам");
  await form.getByRole("button", { name: "Сохранить оффер" }).click();
  await expect(form.locator("input[name=salary]")).toHaveAttribute("aria-invalid", "true");
  await expect(form).toContainText("Слишком большая сумма");
  await expect(form.locator("input[name=position]")).toHaveValue("Менеджер по продажам");
  // Отказ — role=alert; «Оффер сохранён» было бы status
  await expect(form.getByRole("alert").first()).toBeVisible();
});

test("смена пароля: неверный текущий — ошибка у поля, поле очищено, новый пароль остался", async ({ page }) => {
  await page.goto("/a/settings");
  const form = page.locator("form").filter({ has: page.locator("input[name=currentPassword]") }).first();
  await form.locator("input[name=currentPassword]").fill("неверный-текущий-пароль");
  await form.locator("input[name=newPassword]").fill("новая-длинная-фраза-для-входа-91");
  await form.locator("input[name=newPasswordConfirm]").fill("новая-длинная-фраза-для-входа-91");
  await form.getByRole("button", { name: "Сменить пароль" }).click();
  const current = form.locator("input[name=currentPassword]");
  await expect(current).toHaveAttribute("aria-invalid", "true");
  await expect(form).toContainText("Текущий пароль неверен");
  await expect(current).toHaveValue("");
  await expect(current).toBeFocused();
  await expect(form.locator("input[name=newPassword]")).toHaveValue("новая-длинная-фраза-для-входа-91");
});
