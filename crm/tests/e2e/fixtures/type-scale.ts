import type { Page } from "@playwright/test";

/**
 * Шкала текста кабинета — шесть ступеней и ни одной лишней.
 *
 * Размеры — вычисленные, в пикселях: на ноутбуке корень 125%, поэтому
 * 14px шкалы выходит как 17.5, а 16 как 20 (см. app/globals.css).
 * Подписи, поля ввода и заголовки карточек укладываются в эти же числа.
 */
export const LAPTOP_SIZES = [17.5, 20, 25, 37.5, 60];
export const PHONE_SIZES = [12, 14, 16, 18, 24, 36];
export const MAX_SIZES_PER_PAGE = 6;

/**
 * Все размеры текста, видимые на странице: узлы с текстом и поля ввода.
 *
 * Нижняя панель вкладок на телефоне не считается: это навигация, а не
 * текст страницы, и её подписи (10px) держит отдельный тест
 * (mobile-shell.spec.ts, «подписи вкладок не слипаются»).
 */
export async function visibleFontSizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const found = new Set<number>();
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width >= 1 && r.height >= 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) >= 0.05;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const el = node.parentElement;
      if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(el.tagName) || !visible(el)) continue;
      if (el.closest("nav[data-bottom-tabs]")) continue;
      found.add(Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100);
    }
    document
      .querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select")
      .forEach((el) => {
        if (visible(el)) found.add(Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100);
      });
    return [...found].sort((a, b) => a - b);
  });
}
