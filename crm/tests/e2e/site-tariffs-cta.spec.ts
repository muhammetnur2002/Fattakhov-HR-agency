import { expect, test } from "@playwright/test";

/**
 * Кнопка «Рассчитать под мой план» в прайсе (проверка сайта 11.10.2026): на /tariffs она была
 * ссылкой `#diagnostic`, а формы диагностики на этой странице нет — нажатие не делало ничего.
 * Теперь ссылка ведёт на форму главной (`/#diagnostic`), откуда бы её ни нажали.
 *
 * Прайс стоит и на главной, и на /tariffs: проверяем обе страницы. Нужен сервер без `SITE_URL`
 * (обычная разработка на одном адресе), иначе страницы сайта уводят на другой домен.
 */
test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ["/", "/tariffs"]) {
  test(`${path}: «Рассчитать под мой план» приводит к форме диагностики`, async ({ page }) => {
    await page.goto(path);

    const cta = page.getByRole("link", { name: "Рассчитать под мой план" });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/#diagnostic");

    await cta.click();

    await expect(page).toHaveURL(/\/#diagnostic$/);
    // Форма на главной и прокручена в окно, а не осталась за краем
    await expect(page.locator("#diagnostic")).toBeInViewport({ ratio: 0.1 });
    await expect(page.locator("#diagnostic").getByRole("button", { name: /Отправить заявку/ })).toBeAttached();
  });
}
