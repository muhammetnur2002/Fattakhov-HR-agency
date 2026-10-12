import { expect, type Page } from "@playwright/test";

/** Видимые заголовки страницы по порядку чтения: уровень и текст. */
export async function headingOutline(page: Page): Promise<{ level: number; text: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((el) => (el as HTMLElement).checkVisibility({ checkVisibilityCSS: true }))
      .map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? "").trim().slice(0, 50) })),
  );
}

/**
 * Структура заголовков страницы: ровно один h1, он первый, уровни не прыгают
 * вниз через ступень (h1 → h3). По этому читалка экрана и поисковик понимают,
 * где начинается страница и что в ней разделы.
 */
export function expectSoundOutline(outline: { level: number; text: string }[]) {
  const shown = outline.map((h) => `h${h.level} «${h.text}»`).join(" → ");
  expect(outline.filter((h) => h.level === 1), `h1 на странице: ${shown}`).toHaveLength(1);
  expect(outline[0]?.level, `первым идёт h1: ${shown}`).toBe(1);
  outline.forEach((h, i) => {
    if (i > 0) expect(h.level, `прыжок уровня перед h${h.level} «${h.text}»: ${shown}`).toBeLessThanOrEqual(outline[i - 1].level + 1);
  });
}
