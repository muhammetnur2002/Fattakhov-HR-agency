/**
 * Липкие шапки и нижняя панель не закрывают элемент, до которого дошёл Tab.
 *
 * Без scroll-padding браузер подкатывал сфокусированный элемент вплотную к краю окна,
 * то есть под липкую шапку (сайт 81px, кабинет от md) или под плавающую панель разделов
 * на телефоне, и человек не видел, где он (проверка 11.10.2026).
 *
 * Идём в обе стороны: вперёд элемент подъезжает к нижнему краю окна (там опасна нижняя
 * панель телефона), назад — к верхнему, то есть под липкую шапку (Shift+Tab).
 */
import { expect, test, type Page } from "@playwright/test";

type Hit = { text: string; top: number; bottom: number };

/**
 * Идём Tab-ом по странице и собираем положения тех элементов, что лежат в main.
 * maxScroll — докуда страница дошла: в конце списка фокус возвращается к началу.
 */
async function tabThrough(
  page: Page,
  steps: number,
  key: "Tab" | "Shift+Tab" = "Tab",
): Promise<{ hits: Hit[]; maxScroll: number }> {
  const hits: Hit[] = [];
  let maxScroll = 0;
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(key);
    const hit = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest("main")) return { hit: null, scroll: window.scrollY };
      const r = el.getBoundingClientRect();
      return { hit: { text: (el.textContent ?? el.tagName).trim().slice(0, 40), top: r.top, bottom: r.bottom }, scroll: window.scrollY };
    });
    maxScroll = Math.max(maxScroll, hit.scroll);
    if (hit.hit) hits.push(hit.hit);
  }
  return { hits, maxScroll };
}

test.describe("кабинет, компьютер", () => {
  test("Tab по длинной странице: элемент не под шапкой", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/a/candidates");
    const headerBottom = (await page.locator("[data-app-header]").boundingBox())!.height;

    const forward = await tabThrough(page, 70);
    expect(forward.hits.length, "в main нашлось достаточно элементов").toBeGreaterThan(20);
    expect(forward.maxScroll, "страница действительно прокручивалась").toBeGreaterThan(300);
    // Назад от самого низа: элемент подъезжает к верхнему краю — туда, где липкая шапка
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("End");
    const backward = await tabThrough(page, 40, "Shift+Tab");
    expect(backward.hits.length).toBeGreaterThan(10);
    for (const hit of [...forward.hits, ...backward.hits]) {
      expect(hit.top, `«${hit.text}» под шапкой`).toBeGreaterThanOrEqual(headerBottom - 1);
      expect(hit.bottom, `«${hit.text}» ниже окна`).toBeLessThanOrEqual(600 + 1);
    }
  });
});

test.describe("кабинет, телефон", () => {
  test.use({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });

  test("Tab по длинной странице: элемент не под нижней панелью разделов", async ({ page }) => {
    await page.goto("/a/candidates");
    const tabbarTop = (await page.locator("nav[data-bottom-tabs]").boundingBox())!.y;

    const { hits, maxScroll } = await tabThrough(page, 70);
    expect(hits.length).toBeGreaterThan(20);
    expect(maxScroll, "страница действительно прокручивалась").toBeGreaterThan(300);
    for (const hit of hits) {
      expect(hit.bottom, `«${hit.text}» под панелью разделов`).toBeLessThanOrEqual(tabbarTop + 1);
    }
  });
});

test.describe("сайт", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Tab по главной: элемент не под липкой шапкой", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/");
    const headerBottom = await page.evaluate(() => document.querySelector("body header")!.getBoundingClientRect().bottom);

    const forward = await tabThrough(page, 90);
    expect(forward.hits.length).toBeGreaterThan(15);
    expect(forward.maxScroll, "страница действительно прокручивалась").toBeGreaterThan(500);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("End");
    const backward = await tabThrough(page, 60, "Shift+Tab");
    expect(backward.hits.length).toBeGreaterThan(10);
    for (const hit of [...forward.hits, ...backward.hits]) {
      expect(hit.top, `«${hit.text}» под шапкой сайта`).toBeGreaterThanOrEqual(headerBottom - 1);
    }
  });
});
