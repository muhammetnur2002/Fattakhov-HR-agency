/**
 * Блок подтверждения, который заменяет кнопку на месте («Удалить аккаунт? Да / Отмена»):
 * фокус уходит на безопасное действие и возвращается на кнопку, а не теряется на <body>
 * (аудит 11.10.2026, a11y-4). Ничего не удаляем — только открываем и отменяем.
 */
import { expect, test } from "@playwright/test";

test("«Удалить аккаунт»: фокус — на «Отмена», после отмены — снова на кнопке", async ({ page }) => {
  await page.goto("/settings");
  const trigger = page.getByRole("button", { name: /(Удалить|Запросить удаление) аккаунт/ });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press("Enter");

  const cancel = page.getByRole("button", { name: "Отмена" });
  await expect(cancel).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /(Удалить|Запросить удаление) аккаунт/ })).toBeFocused();
});
