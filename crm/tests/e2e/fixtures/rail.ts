import type { Page } from "@playwright/test";

/**
 * Подписи узкой панели разделов, которые не помещаются: самое длинное слово
 * в своём шрифте против ширины, отведённой подписи. null — панели на экране нет.
 */
export async function clippedRailLabels(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
      const rail = [...document.querySelectorAll('aside[data-slot="icon-rail"]')].find((a) => getComputedStyle(a).display !== "none");
      if (!rail) return null;
      const out: string[] = [];
      for (const link of rail.querySelectorAll("a")) {
        // подпись — последний листовой элемент с текстом
        const label = [...link.querySelectorAll("span, div")]
          .filter((e) => e.children.length === 0 && e.textContent?.trim())
          .pop() as HTMLElement | undefined;
        const el = label ?? (link as HTMLElement);
        const words = (el.textContent ?? "").trim().split(/\s+/);
        const probe = document.createElement("span");
        const cs = getComputedStyle(el);
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
        document.body.appendChild(probe);
        const widest = Math.max(...words.map((w) => ((probe.textContent = w), probe.getBoundingClientRect().width)));
        probe.remove();
        const room = (link as HTMLElement).clientWidth - parseFloat(getComputedStyle(link).paddingLeft) - parseFloat(getComputedStyle(link).paddingRight);
        if (widest > room + 0.5) out.push(`«${el.textContent?.trim()}» слово ${Math.round(widest)}px при ширине ${Math.round(room)}px`);
      }
      return out;
  });
}
