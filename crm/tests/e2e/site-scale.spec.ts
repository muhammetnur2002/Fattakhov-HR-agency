/**
 * Сайт на базовом размере 125% (app/globals.css, с 03.10.2026).
 *
 * Корень поднят разом для всего, а ширины, на которых что-то
 * перестраивается — разделы в шапке, ряд из пяти тарифов, — стоят
 * в пикселях окна. Любая правка длины пункта меню, кнопки справа в шапке
 * или отступов карточек тарифа может молча вернуть то, что чинилось
 * 03.10.2026: «Как работаем» в две строки, шапку шире окна на 1024,
 * пятую карточку тарифа за краем, срезанную колонку таблицы сравнения.
 *
 * Обрезку overflow'ом проверка прокрутки не видит: полосы нет, текст
 * просто кончается. Поэтому край каждого элемента с текстом сравнивается
 * с краем ближайшего предка, который режет (hidden/clip). Край — по
 * содержимому (scrollWidth), а не по рамке: длинное слово крупного
 * заголовка вылезает из своего блока, не раздвигая его, и рамка блока
 * при этом целиком внутри карточки. Ленты с прокруткой (overflow: auto)
 * пропускаются — они листаются по замыслу; многоточие (truncate) — тоже:
 * там элемент режет сам себя и честно показывает «…».
 */
import { expect, test } from "@playwright/test";

// Вошедшего сайт уводит в кабинет — нужен анонимный посетитель
test.use({ storageState: { cookies: [], origins: [] } });

const WIDTHS = [375, 640, 768, 1024, 1280, 1440, 1536, 1920];

for (const path of ["/", "/tariffs", "/audit", "/cases"]) {
  test(`${path}: шапка в одну строку, ничего не обрезано и не уезжает вбок`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);

      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const clipped: string[] = [];
        for (const el of document.body.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const box = el.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) continue;
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
          if (!hasText) continue;
          const right = cs.overflowX === "visible" ? box.left + Math.max(box.width, el.scrollWidth) : box.right;
          for (let a = el.parentElement; a; a = a.parentElement) {
            const overflow = getComputedStyle(a).overflowX;
            if (overflow === "auto" || overflow === "scroll") break;
            if (overflow === "hidden" || overflow === "clip") {
              const edge = a === de ? { left: 0, right: de.clientWidth } : a.getBoundingClientRect();
              const by = Math.max(right - edge.right, edge.left - box.left);
              if (by > 1) clipped.push(`«${el.textContent!.trim().slice(0, 30)}» на ${Math.round(by)}px`);
              break;
            }
          }
        }
        const wrapped = [...document.querySelectorAll("header nav a")]
          .filter((a) => getComputedStyle(a).display !== "none")
          .filter((a) => a.getBoundingClientRect().height > parseFloat(getComputedStyle(a).lineHeight) * 1.5)
          .map((a) => a.textContent!.trim());
        return {
          root: parseFloat(getComputedStyle(de).fontSize),
          overflow: de.scrollWidth - de.clientWidth,
          clipped,
          wrapped,
        };
      });

      expect.soft(r.root, `корень на ${width}px`).toBe(width >= 640 ? 20 : 16);
      expect.soft(r.overflow, `прокрутка вбок на ${width}px`).toBe(0);
      expect.soft(r.clipped, `обрезано краем на ${width}px`).toEqual([]);
      expect.soft(r.wrapped, `пункты шапки в две строки на ${width}px`).toEqual([]);
    }
  });
}
