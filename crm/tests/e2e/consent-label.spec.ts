/**
 * Согласие на /register: подпись только у галочки. Раньше раскрывашка «Текст согласия» и ссылка
 * на политику лежали внутри label — нажатие на них могло ставить галочку, а имя галочки
 * разрасталось на весь развёрнутый текст (проверка 11.10.2026). Разметку и описание держит
 * tests/components/register-form.test.tsx, здесь — поведение в настоящем браузере и порядок Tab.
 */
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const LABEL = "Согласен(на) на обработку персональных данных.";

test("нажатие на подпись ставит галочку, на раскрывашку — нет; Tab: галочка, раскрывашка, политика", async ({ page }) => {
  await page.goto("/register");
  const box = page.getByRole("checkbox", { name: LABEL });

  await page.getByText(LABEL).click();
  await expect(box).toBeChecked();
  await page.getByText(LABEL).click();
  await expect(box).not.toBeChecked();

  const toggle = page.getByRole("button", { name: "Текст согласия" });
  await toggle.click();
  await expect(box, "раскрывашка не ставит галочку").not.toBeChecked();
  await expect(page.getByRole("button", { name: "Скрыть текст" })).toHaveAttribute("aria-expanded", "true");

  // Раскрывашка и политика — отдельные остановки Tab после галочки
  await box.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Скрыть текст" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Политика обработки данных" })).toBeFocused();

  // Пробел на раскрывашке сворачивает текст и тоже галочку не трогает
  await page.getByRole("button", { name: "Скрыть текст" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Текст согласия" })).toHaveAttribute("aria-expanded", "false");
  await expect(box).not.toBeChecked();
});
