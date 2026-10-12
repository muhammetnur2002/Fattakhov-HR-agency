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

/**
 * Отмена заявки клиентом (замечание независимой проверки к PR #119): «Отменить заявку» пропадает, на её месте форма
 * причины. Раньше фокус терялся на <body>, форма не была названа вопросом. Ничего не отменяем — открываем и
 * закрываем с клавиатуры.
 */
test("«Отменить заявку»: форма названа вопросом, фокус в поле причины, «Не отменять» возвращает на кнопку", async ({ page }) => {
  await page.goto("/vacancies/vac_1");
  const trigger = page.getByRole("button", { name: "Отменить заявку" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press("Enter");

  const form = page.getByRole("form", { name: "Почему отменяете?" });
  await expect(form).toBeVisible();
  await expect(form.getByRole("textbox")).toBeFocused();

  await form.getByRole("button", { name: "Не отменять" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Отменить заявку" })).toBeFocused();
});

/**
 * Замечание проверки: поиск и фильтры уходили на тот же адрес при показе страницы — ожидание, затемнение списка и
 * «Список обновлён» без единого действия человека. Запросы страниц замедлены на 1,5 с, наблюдатель ставится до
 * загрузки и запоминает всё, что мелькнуло.
 */
for (const url of ["/vacancies", "/candidates"]) {
  test(`${url}: за 3 секунды после загрузки ни ожидания, ни спиннера, ни объявления`, async ({ page }) => {
    await page.addInitScript(() => {
      const seen = { busy: 0, spinner: 0, live: "" };
      (window as unknown as { __listSeen: typeof seen }).__listSeen = seen;
      const look = () => {
        if (document.querySelector('[data-slot="list-region"][aria-busy="true"]')) seen.busy++;
        if (document.querySelector('[data-slot="list-search-pending"], [data-slot="select-pending"]')) seen.spinner++;
        const said = document.querySelector('[data-slot="list-live"]')?.textContent;
        if (said) seen.live = said;
      };
      new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      setInterval(look, 50);
    });
    await page.route(/_rsc=/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto(url);
    await expect(page.locator('[data-slot="list-search"] input')).toBeVisible();
    await page.waitForTimeout(3200);

    const seen = await page.evaluate(() => (window as unknown as { __listSeen: { busy: number; spinner: number; live: string } }).__listSeen);
    expect(seen, "при показе страницы список не должен ждать и объявлять").toEqual({ busy: 0, spinner: 0, live: "" });
  });
}
