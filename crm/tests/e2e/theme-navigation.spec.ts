import { expect, test } from "@playwright/test";

/**
 * Переход по вкладкам нижней панели при РУЧНОМ выборе темы.
 *
 * Тег-перебивка цвета полосы браузера (lib/theme-color.ts) стоит в <head> до гидратации.
 * Если его `content` совпадает с `content` тега Next, React забирает тег себе при гидратации,
 * и первый же переход по ссылке обрывается с TypeError («Cannot read properties of null
 * (reading 'removeChild')»): адрес в строке меняется или нет, а страница и подсветка вкладки
 * остаются прежними (замер на Next 16.3.8 и 16.4.0). Ломалось у каждого, кто хоть раз нажал
 * переключатель темы, — то есть у тех, у кого в localStorage лежит «light» или «dark».
 *
 * Проверяется то, что видит человек: после нажатия на вкладку приложение приняло раздел
 * (подсветка и заголовок), и перебивка никуда не делась.
 */
test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

for (const theme of ["light", "dark", "system"] as const) {
  test(`тема «${theme}» в памяти: вкладка «Кандидаты» открывает раздел, ошибок страницы нет`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // без памяти тема просто «как в системе»
      }
    }, theme);

    await page.goto("/a/vacancies", { waitUntil: "networkidle" });
    const nav = page.locator("nav[data-bottom-tabs]");
    await expect(nav).toBeVisible();

    const manual = theme !== "system";
    const override = page.locator("meta#theme-color-override");
    // После гидратации перебивка на месте (ручной выбор) или её нет («как в системе»)
    await expect(override).toHaveCount(manual ? 1 : 0);

    const tab = nav.getByRole("link", { name: "Кандидаты" });
    const box = (await tab.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(tab, "приложение приняло раздел").toHaveAttribute("aria-current", "page", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/a\/candidates/);
    await expect(page.getByRole("heading", { level: 1, name: "Кандидаты" })).toBeVisible({ timeout: 15_000 });
    await expect(override, "после перехода перебивка так же на месте").toHaveCount(manual ? 1 : 0);
    expect(errors, "страница не жалуется").toEqual([]);
  });
}
