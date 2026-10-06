/**
 * Кликабельность: то, что выглядит нажимаемым, нажимается — целиком
 * и с рукой под курсором.
 *
 * Аудит 05.10.2026 (Playwright, все страницы обеих ролей, телефон
 * и ноутбук): у всех кнопок на ноутбуке была стрелка вместо руки —
 * умолчание Tailwind 4; в «Участии в воронках» на карточке кандидата
 * нажималось только название вакансии, 20px в высоту; у вопросов
 * в «Помощи» — только строка текста посередине полосы.
 *
 * Нажатия — координатами (page.mouse / touchscreen), а не click() по
 * элементу: так нажимает человек — в точку на экране, и тест ловит
 * именно то, что под ней окажется.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const cursorOf = (el: Locator) => el.evaluate((node) => getComputedStyle(node).cursor);

async function centerOf(el: Locator) {
  const box = await el.boundingBox();
  expect(box, "элемент должен быть на экране").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

test.describe("ноутбук", () => {
  test("над кнопками — рука, над карточкой доски — «схватить»", async ({ page }) => {
    await page.goto("/a/vacancies/vac_1");

    await expect(page.getByRole("button", { name: "Переключить тему" })).toBeVisible();
    expect(await cursorOf(page.getByRole("button", { name: "Переключить тему" }))).toBe("pointer");
    expect(await cursorOf(page.getByRole("tab", { name: "Бриф" }))).toBe("pointer");

    // Утилита в разметке главнее общего правила: карточку берут, а не нажимают
    const card = page.locator('[aria-roledescription="sortable"]').filter({ visible: true }).first();
    await expect(card).toBeVisible();
    expect(await cursorOf(card)).toBe("grab");
  });

  test("вопрос в «Помощи» раскрывается нажатием у края полосы", async ({ page }) => {
    await page.goto("/a/help");

    const first = page.locator("details").first();
    await expect(first).not.toHaveAttribute("open");
    const box = (await first.boundingBox())!;
    // 4px от верхнего края — раньше это был мёртвый отступ над текстом
    await page.mouse.click(box.x + box.width / 2, box.y + 4);
    await expect(first).toHaveAttribute("open");
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  async function tapStageBadge(page: Page) {
    const row = page.locator("li").filter({ has: page.locator('a[href="/a/applications/app_1"]') });
    const badge = row.locator('[data-slot="badge"]').first();
    await badge.scrollIntoViewIfNeeded();
    const { x, y } = await centerOf(badge);
    await page.touchscreen.tap(x, y);
  }

  test("строка «Участие в воронках» нажимается целиком, не только название", async ({ page }) => {
    await page.goto("/a/candidates/cand_1");
    await tapStageBadge(page);
    await expect(page).toHaveURL(/\/a\/applications\/app_1$/);
  });
});
