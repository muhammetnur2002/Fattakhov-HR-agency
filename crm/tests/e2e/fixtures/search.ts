import { expect, type Page } from "@playwright/test";

/**
 * Замер полей поиска для e2e: шапка кабинета и поле списка.
 *
 * Меряется то, что видит человек: ширина плашки поля, не влезла ли подсказка в
 * поле (ширина текста подсказки шрифтом поля против свободного места внутри),
 * не уехала ли страница вбок.
 */
export type SearchMeasure = {
  /** Ширина поиска в шапке; null — поле скрыто (телефон: там значок-ссылка). */
  header: number | null;
  /** Подсказка в поле шапки влезает целиком (для скрытого поля — true). */
  headerPlaceholderFits: boolean;
  /** Ширины всех полей поиска в рабочей области. */
  lists: { width: number; placeholderFits: boolean }[];
  /** Ширина рабочей области (main без отступов). */
  content: number;
  overflowX: number;
};

export async function measureSearch(page: Page): Promise<SearchMeasure> {
  return page.evaluate(() => {
    const fits = (input: HTMLInputElement) => {
      const style = getComputedStyle(input);
      const canvas = document.createElement("canvas").getContext("2d")!;
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = canvas.measureText(input.placeholder).width;
      const free = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return text <= free;
    };

    const headInput = document.querySelector<HTMLInputElement>('[data-app-header] input[aria-label="Поиск по кабинету"]');
    const headBox = headInput?.closest("form") ?? null;
    const header = headBox && headBox.getBoundingClientRect().width > 0 && headInput!.offsetParent ? headBox.getBoundingClientRect().width : null;

    const headerPlaceholderFits = header === null ? true : fits(headInput!);

    const lists = [...document.querySelectorAll<HTMLElement>('main [data-slot="list-search"]')].map((box) => ({
      width: box.getBoundingClientRect().width,
      placeholderFits: fits(box.querySelector("input")!),
    }));

    const main = document.querySelector("main")!;
    const mainStyle = getComputedStyle(main);
    const content = main.clientWidth - parseFloat(mainStyle.paddingLeft) - parseFloat(mainStyle.paddingRight);
    return { header, headerPlaceholderFits, lists, content, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

/** Прежние ширины: поле шапки (w-64) и наибольшее поле списка (max-w-sm) — на ноутбуке, корень 20px. */
export const PREVIOUS = { header: 320, list: 480 } as const;

/** Общие утверждения о поиске на одном экране. */
export function expectSearch(m: SearchMeasure, viewportWidth: number) {
  expect(m.overflowX, "страница не должна уезжать вбок").toBe(0);
  expect(m.headerPlaceholderFits, "подсказка в шапке должна влезать целиком").toBe(true);
  expect(m.lists.length, "в рабочей области должно быть поле поиска").toBeGreaterThan(0);
  for (const field of m.lists) {
    expect(field.placeholderFits, "подсказка в поле списка должна влезать целиком").toBe(true);
    // поле не шире рабочей области: на телефоне не вылезает за экран
    expect(field.width).toBeLessThanOrEqual(m.content + 1);
  }
  if (viewportWidth >= 1024) {
    // «Не короче чем в полтора раза» от прежнего наибольшего
    for (const field of m.lists) expect(field.width).toBeGreaterThanOrEqual(PREVIOUS.list * 1.5 - 1);
    expect(m.header).not.toBeNull();
    expect(m.header!).toBeGreaterThanOrEqual(PREVIOUS.header * 1.5 - 1);
  } else if (viewportWidth >= 768) {
    // Планшет: поле списка занимает рабочую область целиком, в шапке — не уже 1,5 от прежних 233
    for (const field of m.lists) expect(Math.abs(field.width - Math.min(m.content, 720))).toBeLessThanOrEqual(1);
    expect(m.header!).toBeGreaterThanOrEqual(233 * 1.5 - 1);
  } else {
    for (const field of m.lists) expect(Math.abs(field.width - m.content)).toBeLessThanOrEqual(1);
  }
}
