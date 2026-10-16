import { expect, test, type Page } from "@playwright/test";

/**
 * Сетка сайта на живых страницах: ось, интервал после заголовка раздела, лента и «дуга» тарифов,
 * пропорции колонок. Исходники этих правил — `components/marketing/layout.ts`, а `tests/site-rhythm.test.ts`
 * не даёт вернуть копию. Здесь — то, что видит человек: куда браузер поставил левый край заголовка,
 * где кончилась лента, на какой высоте стоит цена.
 *
 * Замеры 11.10.2026 до правки (1280 · 1440 · 1920):
 * - левый край h1 внутренних страниц 105 · 185 · 425px при логотипе на 70;
 * - лента тарифов кончалась за 45px до края окна на 1280 и 1440, за 15px — на 1024;
 * - цена центральной карточки ниже остальных на 51px (плашка «Рекомендуем» стояла в потоке), на 1920 разброс
 *   цен по высоте 66px; на 1536 пятая карточка выступала за край окна на 12px;
 * - от заголовка раздела до содержимого 50px на главной и 30px на тарифах, аудите, кейсах;
 * - левый край второй колонки двухколоночных блоков главной — семь значений.
 */
/**
 * `reducedMotion: "reduce"` обязателен: корень заголовка раздела — `.reveal`, а при
 * `prefers-reduced-motion: no-preference` его анимация появления (`reveal-in`, сдвиг на 22px) у блоков
 * ниже сгиба сдвигает заголовок, но не соседа без `.reveal` (калькулятор, тарифы, сравнение). Замер
 * `getBoundingClientRect` тогда зависит от того, где браузер остановил анимацию, а не от вёрстки.
 * Штатный конфиг Playwright движение не отключает (замечание проверки к PR #118, 12.10.2026).
 */
test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

const TOLERANCE = 1;

test.describe("ось: заголовок страницы стоит на одной вертикали с логотипом шапки", () => {
  for (const path of ["/tariffs", "/cases", "/audit"]) {
    for (const width of [1280, 1440, 1920]) {
      test(`${path} на ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const x = await page.evaluate(() => {
          const logo = document.querySelector("header a[aria-label='Fattakhov HR Agency']")!.getBoundingClientRect().left;
          const h1 = document.querySelector("main h1")!.getBoundingClientRect().left;
          const eyebrow = document.querySelector("main h1")!.previousElementSibling!.getBoundingClientRect().left;
          // первый раздел под героем — та же ось, что у героя. h2 внутри карточки-статьи — не заголовок раздела:
          // на /cases имя клиента — h2 (под h1 сразу h3 пропускал уровень), и стоит оно во внутреннем поле карточки
          const h2 = [...document.querySelectorAll("main h2")].find((h) => !h.closest("article"))!.getBoundingClientRect().left;
          return { logo, h1, eyebrow, h2 };
        });
        expect(Math.abs(x.h1 - x.logo), `h1 ${x.h1} против логотипа ${x.logo}`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(x.eyebrow - x.logo), "надзаголовок героя").toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(x.h2 - x.logo), "заголовок первого раздела").toBeLessThanOrEqual(TOLERANCE);
      });
    }
  }
});

test.describe("ось: полоса цифр под первым экраном главной стоит на оси логотипа", () => {
  // Полоса держала собственную копию поля (`md:px-3 xl:px-9` плюс `px-5` у ячеек): сумма совпадала
  // с полем сайта, но правка `SITE_GUTTER` её не двигала. Теперь она берёт `SITE_CONTAINER`.
  for (const width of [375, 768, 1280, 1440, 1920]) {
    test(`/ на ${width}px: левый край первой цифры = левый край логотипа`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const x = await page.evaluate(() => {
        const logo = document.querySelector("header a[aria-label='Fattakhov HR Agency']")!.getBoundingClientRect().left;
        const label = [...document.querySelectorAll("main div")].find((d) => d.children.length === 0 && d.textContent?.trim() === "активных вакансий")!;
        const first = label.previousElementSibling!.getBoundingClientRect().left;
        const h1 = document.querySelector("main h1")!.getBoundingClientRect().left;
        return { logo, first, h1 };
      });
      expect(Math.abs(x.first - x.logo), `первая цифра ${x.first} против логотипа ${x.logo}`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(x.h1 - x.logo), `заголовок главной ${x.h1} против логотипа ${x.logo}`).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});

/** Заголовки разделов (`SectionHead`) на странице — не меньше стольки: пустой список не должен считаться успехом. */
const SECTION_HEADS: Record<string, number> = { "/": 11, "/tariffs": 4, "/cases": 3, "/audit": 4, "/privacy": 1 };

test.describe("ритм: от заголовка раздела до содержимого — один интервал", () => {
  for (const [name, width, root] of [
    ["ноутбук 1280", 1280, 20],
    ["телефон 375", 375, 16],
  ] as const) {
    for (const path of Object.keys(SECTION_HEADS)) {
      test(`${path}, ${name}: 2,5 корня после каждого заголовка`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        // Корень SectionHead (components/marketing/sections.tsx) — `.reveal`, у которого заголовок h1/h2 прямой
        // ребёнок. Выбираем по этому признаку, а не по классу интервала (`mb-10`): иначе, убрав интервал, получим
        // пустой список и «красный» тест не по величине, а по отсутствию селектора
        const gaps = await page.evaluate(() =>
          [...document.querySelectorAll("main .reveal:has(> h1, > h2)")].flatMap((head) => {
            const next = head.nextElementSibling;
            if (!next) return [];
            return [{ title: head.textContent!.trim().slice(0, 40), gap: next.getBoundingClientRect().top - head.getBoundingClientRect().bottom }];
          }),
        );
        expect(gaps.length, "заголовки разделов с содержимым под ними найдены (не меньше, чем в исходниках страницы)").toBeGreaterThanOrEqual(SECTION_HEADS[path]);
        for (const g of gaps) {
          expect(g.gap, `«${g.title}»: интервал до содержимого`).toBeGreaterThanOrEqual(root * 2.5 - TOLERANCE);
          expect(g.gap, `«${g.title}»: интервал до содержимого`).toBeLessThanOrEqual(root * 2.5 + TOLERANCE);
        }
      });
    }
  }
});

type StripMetrics = {
  stripLeft: number;
  stripRight: number;
  innerWidth: number;
  scrollWidth: number;
  mode: string;
  cards: { top: number; left: number; right: number; width: number; priceY: number }[];
};

async function pricing(page: Page): Promise<StripMetrics> {
  return page.evaluate(() => {
    const strip = document.querySelector("#pricing .snap-x")!;
    const cards = [...strip.children].map((card) => {
      const r = card.getBoundingClientRect();
      // цена — единственный блок с `whitespace-nowrap` в плитке
      const price = card.querySelector(".whitespace-nowrap")!.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, width: r.width, priceY: price.top };
    });
    const r = strip.getBoundingClientRect();
    return {
      stripLeft: r.left,
      stripRight: r.right,
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mode: getComputedStyle(strip).display,
      cards,
    };
  });
}

test.describe("тарифы: лента прокрутки уходит под край окна", () => {
  for (const path of ["/tariffs", "/"]) {
    for (const width of [768, 1024, 1280, 1440]) {
      test(`${path} на ${width}px: правый край ленты = край окна`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const m = await pricing(page);
        expect(m.mode, "до 1536 — лента, а не сетка").toBe("flex");
        expect(Math.abs(m.stripRight - m.innerWidth), `лента кончается на ${m.stripRight}, окно ${m.innerWidth}`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(m.stripLeft), "и слева она у края окна").toBeLessThanOrEqual(TOLERANCE);
        expect(m.scrollWidth, "страница не шире окна").toBe(m.innerWidth);
      });
    }
  }
});

test.describe("тарифы: от заголовка раздела до первой плитки — тот же интервал, что у остальных", () => {
  // Место под плашку «Рекомендуем» (`pt-4` ленты) забирается из зазора (`-mt-4`), а не прибавляется
  // к нему: иначе до первой плитки было 70px вместо 50 (телефон — 56 вместо 40). С 1536 лента — сетка,
  // и дуга поднимает соседей центра на 10px, центр на 20px: зазор 50 · 40 · 30 · 40 · 50.
  for (const path of ["/tariffs", "/"]) {
    for (const width of [375, 768, 1280, 1440, 1536, 1920]) {
      test(`${path} на ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const m = await page.evaluate(() => {
          const strip = document.querySelector("#pricing .snap-x")!;
          const head = strip.parentElement!.previousElementSibling!;
          const headBottom = head.getBoundingClientRect().bottom;
          return {
            rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
            root: strip.parentElement!.getBoundingClientRect().top - headBottom,
            tiles: [...strip.children].map((card) => card.getBoundingClientRect().top - headBottom),
            grid: getComputedStyle(strip).display === "grid",
          };
        });
        const base = m.rem * 2.5;
        expect(Math.abs(m.root - base), `обёртка тарифов ${m.root}, ждали ${base}`).toBeLessThanOrEqual(TOLERANCE);
        const lift = m.grid ? [0, 0.5, 1, 0.5, 0] : [0, 0, 0, 0, 0];
        m.tiles.forEach((gap, i) => {
          const want = base - lift[i] * m.rem;
          expect(Math.abs(gap - want), `плитка ${i + 1}: ${gap}px от заголовка, ждали ${want}`).toBeLessThanOrEqual(TOLERANCE);
        });
      });
    }
  }
});

test.describe("тарифы: цены на общей линии, дуга симметрична, за край окна ничего не выходит", () => {
  for (const path of ["/tariffs", "/"]) {
    for (const width of [768, 1024, 1280, 1440, 1536, 1920]) {
      test(`${path} на ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const m = await pricing(page);
        const ys = m.cards.map((c) => c.priceY);
        expect(Math.max(...ys) - Math.min(...ys), `цены по высоте: ${ys.join(" · ")}`).toBeLessThanOrEqual(2);
        expect(m.scrollWidth, "страница не шире окна").toBe(m.innerWidth);

        if (m.mode === "grid") {
          const { cards } = m;
          expect(cards.at(-1)!.right, "пятая карточка не выходит за край окна").toBeLessThanOrEqual(m.innerWidth);
          expect(cards[0].left, "первая карточка не выходит за левый край").toBeGreaterThanOrEqual(0);
          // симметрия: ширины и верхние края зеркальны, центральная выше соседей, соседи выше крайних
          expect(Math.abs(cards[0].width - cards[4].width)).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(cards[1].width - cards[3].width)).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(cards[0].top - cards[4].top)).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(cards[1].top - cards[3].top)).toBeLessThanOrEqual(TOLERANCE);
          expect(cards[2].top, "центр выше соседей").toBeLessThan(cards[1].top - 5);
          expect(cards[1].top, "соседи выше крайних").toBeLessThan(cards[0].top - 5);
          // и ничего не налезает на соседа
          for (let i = 1; i < cards.length; i++) expect(cards[i].left).toBeGreaterThanOrEqual(cards[i - 1].right);
        }
      });
    }
  }
});

test.describe("колонки: две пропорции и один промежуток", () => {
  /** Доли первой колонки: 1fr/1fr и 1.15fr/0.85fr. */
  const SHARES = [0.5, 0.575];

  for (const path of ["/", "/tariffs", "/cases"]) {
    test(`${path} на 1440px: двухколоночные блоки делятся на 1/1 или 1.15/0.85, промежуток 50px`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const blocks = await page.evaluate(() =>
        [...document.querySelectorAll("main *")].flatMap((el) => {
          const cs = getComputedStyle(el);
          if (cs.display !== "grid") return [];
          const cols = cs.gridTemplateColumns.split(" ").map(parseFloat);
          const gap = parseFloat(cs.columnGap);
          // блоки раскладки: две колонки с промежутком ≥ 25px; сетки полей формы (20px) и плиток (1px) — не они
          if (cols.length !== 2 || !(gap >= 25)) return [];
          return [{ share: cols[0] / (cols[0] + cols[1]), gap, text: (el.textContent ?? "").trim().slice(0, 30) }];
        }),
      );
      expect(blocks.length, "на странице есть двухколоночные блоки").toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.gap, `«${b.text}»: промежуток`).toBe(50);
        expect(
          SHARES.some((s) => Math.abs(b.share - s) < 0.006),
          `«${b.text}»: доля первой колонки ${b.share.toFixed(3)}, допустимы ${SHARES.join(" и ")}`,
        ).toBe(true);
      }
    });
  }
});

test.describe("страницы сайта не шире окна на всех ширинах", () => {
  for (const path of ["/", "/tariffs", "/cases", "/audit"]) {
    test(path, async ({ page }) => {
      for (const width of [375, 768, 1024, 1280, 1440, 1536, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(over, `прокрутка вбок на ${width}px`).toBe(0);
      }
    });
  }
});
