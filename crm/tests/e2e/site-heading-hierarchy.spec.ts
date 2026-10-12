import { expect, test, type Page } from "@playwright/test";

/**
 * Иерархия заголовков сайта по размеру: h3 не крупнее ближайшего h2 перед ним.
 *
 * Сверка 11.10.2026: выделенная плитка «Кого закрываем» набирала h3 в 60px при h2 раздела 45px,
 * а имя клиента в кейсе — 36px при h2 28px на телефоне: подзаголовок «перекрикивал» заголовок.
 * Смотрим вычисленные размеры на живых страницах, а не классы: шкала сайта — токены `--text-*`,
 * и одинаковый класс на телефоне и ноутбуке даёт разные пиксели.
 *
 * Баннерные h2 главной (`text-2xl`) — осознанный уровень ниже: h3 после них сравниваются с ними,
 * а не с h2 соседнего раздела, поэтому плитки не должны быть крупнее и этого h2.
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Heading = { level: 2 | 3; text: string; size: number };

async function headings(page: Page): Promise<Heading[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width >= 1 && r.height >= 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    return [...document.querySelectorAll("h2, h3")]
      .filter(visible)
      .map((el) => ({
        level: (el.tagName === "H2" ? 2 : 3) as 2 | 3,
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50),
        size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100,
      }));
  });
}

/** h3, у которых размер больше ближайшего h2 выше по странице. */
function biggerThanSection(list: Heading[]): string[] {
  const offenders: string[] = [];
  let section: Heading | null = null;
  for (const h of list) {
    if (h.level === 2) section = h;
    else if (section && h.size > section.size) {
      offenders.push(`«${h.text}» ${h.size}px крупнее h2 «${section.text}» ${section.size}px`);
    }
  }
  return offenders;
}

for (const [name, viewport] of [
  ["ноутбук", { width: 1440, height: 900 }],
  ["узкий ноутбук", { width: 1280, height: 800 }],
  ["телефон", { width: 375, height: 800 }],
] as const) {
  for (const path of ["/", "/cases", "/tariffs"]) {
    test(`сайт, ${name}: ${path} — ни один h3 не крупнее h2 раздела`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await page.waitForTimeout(800);
      const list = await headings(page);
      expect(list.filter((h) => h.level === 3).length, "на странице есть h3, иначе проверять нечего").toBeGreaterThan(0);
      expect(biggerThanSection(list)).toEqual([]);
    });
  }
}

test("сторож сторожа: проверка находит h3 крупнее h2", () => {
  const found = biggerThanSection([
    { level: 2, text: "Раздел", size: 28 },
    { level: 3, text: "Плитка", size: 36 },
    { level: 3, text: "Нормальная", size: 28 },
  ]);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("Плитка");
});
