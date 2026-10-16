/**
 * Этап в карточке кандидата клиента: название не усекается многоточием, пока в строке есть место.
 *
 * Приёмка 15.10.2026: ниже xl (1280) ячейки ожидания и этапа были фиксированными `w-32` (128 точек), бейдж
 * внутри — 110. «Интервью с клиентом» (131), «Представлен клиенту» (130) и «Финальный этап / тестовое» (163)
 * заканчивались на «Интервью с кли…» при свободном месте рядом; на 1024–1279 с мышью то же с ячейкой 160 точек.
 * От 1280 колонки общие (subgrid) и усечений нет. Меряем `scrollWidth` против `clientWidth` у названия
 * этапа на странице кандидатов и на дашборде, на телефоне, планшете и узком окне ноутбука.
 */
import { expect, test } from "@playwright/test";

const WIDTHS = [375, 390, 768, 1024, 1100, 1279, 1280, 1440];

for (const path of ["/candidates", "/dashboard"]) {
  test(`${path}: название этапа не срезано многоточием на ${WIDTHS.join(", ")}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const stages = await page.evaluate(() =>
        [...document.querySelectorAll('main a[href^="/applications/"] [data-slot="badge"][data-variant="secondary"] span.truncate')]
          .filter((s) => (s as HTMLElement).checkVisibility())
          .map((s) => ({ name: s.textContent, cut: (s as HTMLElement).scrollWidth - (s as HTMLElement).clientWidth })),
      );
      expect(stages.length, `${width}: на странице несколько карточек с этапом`).toBeGreaterThanOrEqual(3);
      expect(
        stages.filter((s) => s.cut > 1),
        `${width}: срезанные этапы`,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}: страница не уезжает вбок`).toBe(0);
    }
  });
}
