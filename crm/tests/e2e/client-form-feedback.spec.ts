/**
 * Формы кабинета клиента: ошибка у поля, набранное остаётся, успех объявляется вежливо.
 *
 * Сверка 11.10.2026: ошибка схемы шла одной строкой над кнопкой («ИНН — 10 цифр»), а после ответа сервера
 * React 19 стирал неуправляемые поля формы. Здесь — настоящий браузер: фокус, `aria-*`, значок и роль плашки
 * jsdom-тестами (tests/components/use-form-action.test.tsx) не проверить так, как их видит человек.
 * Отказы схемы ничего не меняют в базе; «сохранить без правок» перезаписывает те же значения. Успешное
 * сохранение профиля компании здесь не проверяется: оно зовёт студплатформу, а без неё (STUDENTS_URL) падает.
 */
import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/client-admin.json" });

test.describe("профиль компании: ошибка у поля", () => {
  test("ИНН неверен: рамка, текст под полем, фокус на первом неверном, введённое остаётся", async ({ page }) => {
    await page.goto("/company");
    const inn = page.locator("input[name=inn]");
    const website = page.locator("input[name=website]");
    const description = page.locator("textarea[name=description]");
    const descriptionBefore = await description.inputValue();

    await inn.fill("12345");
    await website.fill("starfish.ru");
    await page.getByRole("button", { name: "Сохранить" }).click();

    // Ошибка стоит под самим полем и связана с ним для читалки
    await expect(inn).toHaveAttribute("aria-invalid", "true");
    const describedBy = await inn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const errorId = describedBy!.split(" ").find((id) => id.endsWith("-error"))!;
    await expect(page.locator(`[id="${errorId}"]`)).toContainText("ИНН — 10 цифр у компании или 12 у ИП");
    // Значок «!» — ошибка отличима и без цвета
    await expect(page.locator(`[id="${errorId}"] svg`)).toBeVisible();

    // Фокус — на первое неверное поле (ИНН идёт раньше сайта), а не остался на <body>
    await expect(inn).toBeFocused();
    await expect(website).toHaveAttribute("aria-invalid", "true");

    // Набранное не стёрто: ни неверное, ни нетронутое
    await expect(inn).toHaveValue("12345");
    await expect(website).toHaveValue("starfish.ru");
    await expect(description).toHaveValue(descriptionBefore);

    // Сводка над кнопкой объявляется сразу
    await expect(page.getByRole("alert").filter({ hasText: "Проверьте заполнение полей" })).toBeVisible();
  });
});

test.describe("настройки: успех объявляется вежливо", () => {
  test("«Сохранено»: значок-галочка, не alert; читалке — через постоянную область", async ({ page }) => {
    await page.goto("/settings");
    const form = page.locator("form", { has: page.locator("input[name=fullName]") }).first();
    // Область для читалки есть в странице ДО ответа и пуста: живая область, вставленная сразу с текстом, объявляется не везде
    const announcer = page.locator("#live-announcer");
    await expect(announcer).toHaveAttribute("role", "status");
    await expect(announcer).toHaveText("");
    await form.getByRole("button", { name: "Сохранить" }).click();
    const plate = form.locator("[data-form-message=ok]").filter({ hasText: "Сохранено" });
    await expect(plate).toBeVisible();
    await expect(plate.locator("svg")).toBeVisible();
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(announcer).toHaveText("Сохранено");
  });

  test("ошибка в профиле: у поля имени, не общей строкой, и введённое остаётся", async ({ page }) => {
    await page.goto("/settings");
    const form = page.locator("form", { has: page.locator("input[name=fullName]") }).first();
    const position = form.locator("input[name=position]");
    const positionBefore = await position.inputValue();
    await form.locator("input[name=fullName]").fill("А");
    await position.fill(`${positionBefore} (правка)`);
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form.locator("input[name=fullName]")).toHaveAttribute("aria-invalid", "true");
    await expect(form.locator("input[name=fullName]")).toBeFocused();
    await expect(position).toHaveValue(`${positionBefore} (правка)`);
  });
});

test.describe("приглашение коллеги: ошибка адреса под рядом", () => {
  test("неверный адрес: поле помечено, текст ниже, остальное не стёрто", async ({ page }) => {
    await page.goto("/settings");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Пригласить" }) }).first();
    await form.locator("input[name=email]").fill("kollega@starfish");
    await form.locator("input[name=position]").fill("Руководитель отдела");
    await form.getByRole("button", { name: "Пригласить" }).click();
    await expect(form.locator("input[name=email]")).toHaveAttribute("aria-invalid", "true");
    await expect(form.locator("input[name=email]")).toBeFocused();
    await expect(form.locator("input[name=position]")).toHaveValue("Руководитель отдела");
    await expect(form).toContainText("Проверьте адрес почты");
  });
});
