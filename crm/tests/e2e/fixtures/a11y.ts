import { expect, type Page } from "@playwright/test";

/**
 * Ориентиры страницы: ровно один main, у каждого видимого nav есть имя,
 * и среди видимых навигаций нет двух с одним именем (иначе в списке ориентиров
 * читалка не отличит их друг от друга).
 */
export async function expectLandmarks(page: Page, { footer = false }: { footer?: boolean } = {}) {
  const mains = await page.locator("main").count();
  expect(mains, "на странице должен быть ровно один <main>").toBe(1);
  await expect(page.locator("main")).toHaveAttribute("id", "main-content");

  const navs = await page.evaluate(() =>
    [...document.querySelectorAll("nav")]
      .filter((n) => (n as HTMLElement).checkVisibility({ checkVisibilityCSS: true }))
      .map((n) => (n.getAttribute("aria-label") ?? "").trim()),
  );
  expect(navs.every(Boolean), `у каждой навигации есть имя: ${JSON.stringify(navs)}`).toBe(true);
  expect(new Set(navs).size, `имена навигаций различаются: ${JSON.stringify(navs)}`).toBe(navs.length);

  if (footer) {
    expect(await page.getByRole("contentinfo").count(), "подвал страницы").toBe(1);
    expect(await page.getByRole("banner").count(), "шапка страницы").toBe(1);
  }
}

/** Что сейчас в фокусе: тег, id и текст — для сообщений об ошибке. */
export const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? { tag: el.tagName, id: el.id, text: (el.textContent ?? "").trim().slice(0, 40), inMain: !!el.closest("main") } : null;
  });
