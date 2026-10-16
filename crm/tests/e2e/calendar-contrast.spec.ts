/**
 * Календарь агентства: контраст чисел и «сегодня», чипы с именем (приёмка 15.10.2026).
 *
 * Было: `opacity-50` на всей ячейке соседнего месяца давал числу 3,75:1 и гасил чипы с событиями (3,3:1),
 * а белое число в красном круге «сегодня» — 3,93:1 (нужно 4,5:1, WCAG 1.4.3). Axe пропускает однозначные
 * числа как «слишком короткий текст», поэтому рядом с ним — свой расчёт по тем цветам, что браузер нарисовал.
 * Чипы: в узкой ячейке от имени оставалась одна буква («15:00 Э…»), теперь имя уходит под время.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/owner.json", reducedMotion: "reduce" });

const axeSource = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

async function axeContrast(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    // @ts-expect-error axe подключён строкой выше
    const result = await axe.run(document, { runOnly: ["color-contrast"] });
    return result.violations.flatMap((v: { nodes: { target: string[]; any: { data?: { fgColor: string; bgColor: string; contrastRatio: number } }[] }[] }) =>
      v.nodes.map((n) => `${n.target.join(" ")} ${n.any[0]?.data?.fgColor} на ${n.any[0]?.data?.bgColor} = ${n.any[0]?.data?.contrastRatio}`),
    );
  });
}

/** Текущий месяц, сентябрь и ноябрь 2026: у каждой сетки есть дни соседних месяцев с обеих сторон. */
const MONTHS = ["", "&date=2026-09-10", "&date=2026-11-10"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} тема`, () => {
    test.use({ colorScheme: scheme });

    test("месяц и год: axe не находит контраста ниже 4,5:1", async ({ page }) => {
      for (const month of MONTHS) {
        await page.goto(`/a/calendar?view=month${month}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        expect(await axeContrast(page), `месяц ${month || "(сегодня)"}`).toEqual([]);
      }
      await page.goto("/a/calendar?view=year", { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      expect(await axeContrast(page), "год").toEqual([]);
    });

    test("числа дней, в том числе однозначные и соседних месяцев, и круг «сегодня» — не ниже 4,5:1 по нарисованным цветам", async ({ page }) => {
      const checked = { adjacent: 0, today: 0 };
      for (const month of MONTHS) {
        await page.goto(`/a/calendar?view=month${month}`, { waitUntil: "networkidle" });
        const days = await page.evaluate(() => {
          // любой CSS-цвет → rgb через холст: браузер сам знает, во что превращаются токены темы
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d")!;
          const rgb = (css: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
          };
          const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
          const ratio = (a: number[], b: number[]) => {
            const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
          };
          return [...document.querySelectorAll("main a[data-daykey]")].map((link) => {
            const cell = link.parentElement!.parentElement as HTMLElement;
            const own = getComputedStyle(link);
            // у круга «сегодня» своя заливка, у остальных число лежит на заливке ячейки
            const bg = own.backgroundColor === "rgba(0, 0, 0, 0)" ? getComputedStyle(cell).backgroundColor : own.backgroundColor;
            let opacity = 1;
            for (let e: Element | null = link; e; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
            return {
              key: link.getAttribute("data-daykey")!,
              text: link.textContent!.trim(),
              today: /сегодня/.test(link.getAttribute("aria-label") ?? ""),
              ratio: ratio(rgb(own.color), rgb(bg)),
              opacity,
            };
          });
        });
        expect(days.length, `месяц ${month}: сетка дней`).toBeGreaterThanOrEqual(28);
        for (const day of days) {
          expect(day.opacity, `${day.key}: ячейка не гасится прозрачностью`).toBe(1);
          expect(day.ratio, `${day.key} («${day.text}»${day.today ? ", сегодня" : ""}): контраст числа`).toBeGreaterThanOrEqual(4.5);
        }
        // дни соседних месяцев — те, у кого месяц в ключе не совпадает с серединой сетки
        const keys = days.map((d) => d.key);
        const mid = keys[Math.floor(keys.length / 2)].slice(0, 7);
        checked.adjacent += keys.filter((k) => k.slice(0, 7) !== mid).length;
        checked.today += days.filter((d) => d.today).length;
      }
      expect(checked.adjacent, "в проверке были дни соседних месяцев").toBeGreaterThan(0);
      expect(checked.today, "в проверке был круг «сегодня»").toBeGreaterThan(0);
    });
  });
}

test("чипы месяца: название кандидата не режется до буквы — ноутбук, узкое окно, планшет пальцем", async ({ browser }) => {
  let seen = 0;
  // 768 мышью (iPad с трекпадом) в проверку не входит: там увеличенный шрифт (17,5px) при ячейке 68px,
  // и «Эдуард» не помещается в строку даже один
  for (const [width, height, touch] of [[1440, 900, false], [1280, 800, false], [1024, 768, false], [768, 1024, true]] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      reducedMotion: "reduce",
      storageState: "tests/e2e/.auth/owner.json",
    });
    const page = await context.newPage();
    for (const month of ["", "&date=2026-11-10"]) {
      await page.goto(`/a/calendar?view=month${month}`, { waitUntil: "networkidle" });
      const chips = await page.evaluate(() =>
        [...document.querySelectorAll("main ul li > a[href*='/applications/'], main ul li > button[aria-label^='Задача']")]
          .filter((chip) => (chip as HTMLElement).checkVisibility())
          .map((chip) => {
            const title = chip.querySelector("span:last-child") as HTMLElement;
            const line = parseFloat(getComputedStyle(title).lineHeight);
            return {
              text: title.textContent,
              clippedWide: title.scrollWidth - title.clientWidth,
              clippedTall: title.scrollHeight - title.clientHeight,
              lines: Math.round(title.getBoundingClientRect().height / line),
            };
          }),
      );
      for (const chip of chips) {
        seen++;
        // не шире чипа и не срезано по высоте: имя из двух слов помещается в две строки целиком
        expect(chip.clippedWide, `${width}: «${chip.text}» шире чипа`).toBeLessThanOrEqual(1);
        expect(chip.clippedTall, `${width}: «${chip.text}» срезано по высоте`).toBeLessThanOrEqual(1);
        expect(chip.lines, `${width}: «${chip.text}» в ${chip.lines} строках`).toBeLessThanOrEqual(2);
      }
    }
    await context.close();
  }
  test.skip(seen === 0, "в seed нет задач и интервью в видимом диапазоне");
});
