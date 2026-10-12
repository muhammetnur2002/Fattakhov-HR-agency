/**
 * Список кандидатов клиента: левые края одноимённых колонок совпадают во всех карточках.
 *
 * Сверка по скриншоту заказчика (hierarchy-13): две колонки `auto` считались в каждой карточке по
 * тексту этой карточки, остальные «плыли» до 41 точки (зарплата, вакансия, «Ждёт N дней», этап).
 * Меряем левые края пяти ячеек каждой карточки на 1280 и 1440 — допуск 1 точка. Ниже xl (1024) —
 * прежний перенос строк: сетки нет, вбок страница не уезжает.
 */
import { expect, test, type Page } from "@playwright/test";

/** Левые края ячеек каждой карточки списка: [карточка][ячейка]. */
async function cellEdges(page: Page): Promise<{ lefts: number[]; texts: string[] }[]> {
  await page.goto("/candidates", { waitUntil: "networkidle" });
  return page.evaluate(() =>
    [...document.querySelectorAll('main a[href^="/applications/"] [data-slot="card-content"]')].map((content) => ({
      lefts: [...content.children].map((cell) => Math.round(cell.getBoundingClientRect().left * 10) / 10),
      texts: [...content.children].map((cell) => (cell.textContent ?? "").trim().slice(0, 24)),
    })),
  );
}

for (const width of [1280, 1440]) {
  test(`на ${width} левые края пяти колонок совпадают у всех карточек`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const cards = await cellEdges(page);
    expect(cards.length, "в списке должно быть несколько карточек").toBeGreaterThanOrEqual(3);

    // карточки с ожиданием и без него, с разными этапами — иначе проверка ничего не доказывает
    const stages = new Set(cards.map((c) => c.texts[4]));
    expect(stages.size, "в seed этапы у карточек разные").toBeGreaterThan(1);

    for (const card of cards) expect(card.lefts, "в карточке пять ячеек").toHaveLength(5);
    for (let col = 0; col < 5; col++) {
      const edges = cards.map((c) => c.lefts[col]);
      const spread = Math.max(...edges) - Math.min(...edges);
      expect(spread, `колонка ${col + 1}: левые края ${[...new Set(edges)].join(", ")}`).toBeLessThanOrEqual(1);
    }
  });
}

test("ниже xl сетки нет, карточки переносят строки и страница не уезжает вбок", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/candidates", { waitUntil: "networkidle" });
  const display = await page.evaluate(
    () => getComputedStyle(document.querySelector('main a[href^="/applications/"] [data-slot="card-content"]')!).display,
  );
  expect(display).toBe("flex");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("список как раньше: карточки строками, страница не уезжает вбок", async ({ page }) => {
    await page.goto("/candidates", { waitUntil: "networkidle" });
    const display = await page.evaluate(
      () => getComputedStyle(document.querySelector('main a[href^="/applications/"] [data-slot="card-content"]')!).display,
    );
    expect(display).toBe("flex");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
