/**
 * Список сотрудников в аналитике агентства: имя и должность читаются на любой ширине.
 *
 * Приёмка 15.10.2026: у строки был `flex flex-wrap`, а у блока имени `min-w-0 flex-1`, то есть базис 0.
 * Имя «помещалось» в строку рядом с четырьмя показателями всегда и получало остаток: на 375 из 317
 * точек — 16, на 390 — 31, и у каждой строки без бейджа «Финал» читалась одна буква («Д.», «И.»).
 * Срезку не видит проверка прокрутки: у блока `overflow: hidden`, а не `auto`. Меряем сам текст:
 * `scrollWidth` против `clientWidth` у строки имени и должности.
 */
import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/owner.json", reducedMotion: "reduce" });

test("имя и должность сотрудника не срезаны ни на одной ширине от 320 до 1440", async ({ page }) => {
  await page.goto("/a/analytics", { waitUntil: "networkidle" });
  const rowsAt = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main a[href^="/a/analytics/employees/"]')].map((row) => {
        const box = row.children[0] as HTMLElement;
        const [name, role] = [...box.children] as HTMLElement[];
        const cut = (el: HTMLElement) => el.scrollWidth - el.clientWidth;
        return { name: name.textContent, nameCut: cut(name), roleCut: cut(role), boxWidth: Math.round(box.getBoundingClientRect().width) };
      }),
    );

  for (const width of [320, 360, 375, 390, 430, 480, 560, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const rows = await rowsAt();
    expect(rows.length, `${width}: в seed несколько сотрудников`).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.nameCut, `${width}: «${row.name}» срезано, блок имени ${row.boxWidth}px`).toBeLessThanOrEqual(1);
      expect(row.roleCut, `${width}: должность «${row.name}» срезана`).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}: страница не уезжает вбок`).toBe(0);
  }
});
