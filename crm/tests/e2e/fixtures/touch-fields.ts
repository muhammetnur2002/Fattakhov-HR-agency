import type { Page } from "@playwright/test";

/**
 * Поля ввода, видимые на странице, с вычисленным размером шрифта.
 *
 * iOS Safari увеличивает страницу при фокусе на поле мельче 16px (по типу
 * устройства, а не по ширине экрана), поэтому меряется именно вычисленный
 * размер на сенсорной эмуляции. Галочки, переключатели, скрытые и кнопки
 * не считаются.
 */
export async function fieldFontSizes(page: Page): Promise<{ field: string; size: number }[]> {
  return page.evaluate(() => {
    const out: { field: string; size: number }[] = [];
    const skip = ["hidden", "checkbox", "radio", "submit", "button", "file", "range", "image", "reset", "color"];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = el.getAttribute("type");
      if (type && skip.includes(type)) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (rect.width < 1 || rect.height < 1 || cs.visibility === "hidden" || cs.display === "none") continue;
      // Скрытый select Radix лежит под кнопкой и в фокус не попадает
      if (el.getAttribute("aria-hidden") === "true" || (el as HTMLElement).tabIndex === -1) continue;
      const label = el.id || el.getAttribute("name") || el.getAttribute("aria-label") || el.tagName.toLowerCase();
      out.push({ field: `${el.tagName.toLowerCase()}#${label}`, size: parseFloat(cs.fontSize) });
    }
    return out;
  });
}
