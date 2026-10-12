/**
 * Колокольчик уведомлений с клавиатуры: Enter открывает панель, Tab ходит по уведомлениям,
 * Enter открывает уведомление, Esc закрывает и возвращает фокус на колокольчик.
 * Раньше это было меню Radix: Tab в нём перехватывался, а до ссылок не добраться (проверка 11.10.2026).
 */
import { expect, test } from "@playwright/test";

test("колокольчик целиком с клавиатуры", async ({ page }) => {
  await page.goto("/a");
  const bell = page.getByRole("button", { name: /^Уведомления/ });
  const panel = page.getByRole("dialog", { name: "Уведомления" });

  await bell.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();

  // Tab из панели приводит к первой ссылке, дальше — по порядку до «Все уведомления»
  const links = panel.getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await expect(links.nth(i)).toBeFocused();
  }
  await expect(panel.getByRole("link", { name: "Все уведомления" })).toBeFocused();

  // Esc закрывает панель и возвращает фокус на колокольчик
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  // Открываем ссылку Enter-ом
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: "Все уведомления" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/a\/notifications/);
  await expect(panel).toBeHidden();
});
