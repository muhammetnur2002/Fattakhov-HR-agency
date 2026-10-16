import { expect, test, type Page } from "@playwright/test";

/**
 * Сдвиг раскладки (CLS) публичных страниц: загрузка и прокрутка до конца.
 *
 * Замер 15.10.2026 по боевой сборке, 5 прогонов на страницу: на телефоне (375x667, «медленная 4G»,
 * процессор в 4 раза медленнее) при загрузке 0, с прокруткой до 0,008 (счётчики цифр ниже первого экрана
 * меняют ширину), на ноутбуке (1440x900) 0–0,003, на ноутбуке с медленной сетью 0,004 (у главной: ценник на 3px
 * и шапка на 5px при подмене запасного шрифта на Inter, затем счётчик цифр). Граница «хорошо» у Google — 0,1.
 * Порог здесь 0,02: ещё в два с половиной раза выше худшего замера и впятеро ниже границы; если страница
 * сдвинулась заметнее — это уже новая ошибка (картинка без размера, шрифт без подмены, блок, выросший
 * после загрузки), а не шум.
 *
 * Считается как у Chrome: сдвиги без недавнего ввода, окно сессии — пауза не больше секунды и не дольше
 * пяти. Плашка о cookie закреплена внизу и в раскладку не входит.
 *
 * Мерить нужно по боевой сборке: в dev-режиме шрифты и стили приходят иначе. Сайт отдаётся по своему хосту
 * (прокси разводит сайт и кабинет по `SITE_URL`), поэтому адрес — настоящий хост сайта, а на локальный
 * сервер его сводит Chrome (`--host-resolver-rules`): заголовок Host у запросов остаётся честным.
 *   APP_URL=https://my.fattakhovhr.ru SITE_URL=https://fattakhovhr.ru npx next build
 *   (докладываем .next/static и public в .next/standalone, как в Dockerfile)
 *   PORT=3201 HOSTNAME=127.0.0.1 node .next/standalone/server.js
 *   SITE_PERF_BASE_URL=http://fattakhovhr.ru npx playwright test site-cls --config <конфиг без входа>
 *   (в конфиге: use.launchOptions.args = ["--host-resolver-rules=MAP fattakhovhr.ru 127.0.0.1:3201"])
 * Без SITE_PERF_BASE_URL спека страниц не запускается: обычный e2e идёт на dev-сервере. Проверка самого
 * измерителя идёт всегда: без неё зелёный результат ничего не значил бы.
 *
 * Это РУЧНАЯ проверка по боевой сборке, а не автоматический сторож. Автоматически она ничего не охраняет
 * (страницы без SITE_PERF_BASE_URL пропускаются), и «красной без правки» она не была: до оптимизации CLS не
 * превышал 0,0137 при пороге 0,02, то есть на `ours/main` она зелёная тоже. Она ловит только будущий заметный
 * сдвиг, если её запустят перед выкаткой; правила, которые не дают вернуть старые причины LCP, держит
 * `tests/site-speed-rule.test.ts`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const BASE = process.env.SITE_PERF_BASE_URL;

const LIMIT = 0.02;
const PAGES = ["/", "/tariffs", "/cases", "/audit", "/privacy"];
const SCREENS = [
  { name: "телефон 375x667", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "ноутбук 1440x900", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

type Shift = { t: number; v: number; nodes: string[] };

/** Копит сдвиги с самого начала загрузки: observer ставится до скриптов страницы. */
async function observeShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: Shift[] };
    w.__shifts = [];
    const describe = (n: Node | null) => {
      const el = n && n.nodeType === 3 ? n.parentElement : (n as Element | null);
      if (!el || !el.tagName) return "?";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} «${text}»`;
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number; startTime: number; sources?: Array<{ node: Node | null }> }>) {
        if (entry.hadRecentInput) continue;
        w.__shifts.push({ t: Math.round(entry.startTime), v: entry.value, nodes: (entry.sources ?? []).map((s) => describe(s.node)) });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Окно сессии как у Chrome: пауза < 1 с между сдвигами, окно не длиннее 5 с; берётся худшее окно. */
function sessionCls(shifts: Shift[]): number {
  let best = 0;
  let current = 0;
  let first = 0;
  let last = 0;
  for (const s of shifts) {
    if (current > 0 && s.t - last < 1000 && s.t - first < 5000) current += s.v;
    else {
      current = s.v;
      first = s.t;
    }
    last = s.t;
    best = Math.max(best, current);
  }
  return best;
}

async function readShifts(page: Page): Promise<Shift[]> {
  return page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts);
}

test("измеритель видит сдвиг: блок, вставленный выше текста, даёт CLS больше порога", async ({ page }) => {
  await observeShifts(page);
  await page.route("http://shift.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><body style="margin:0"><div id="a" style="width:400px;height:300px;background:#ccc">Текст</div>
        <script>setTimeout(() => { const d = document.createElement("div"); d.style.cssText = "height:300px"; document.body.insertBefore(d, document.getElementById("a")); }, 150)</script></body>`,
    }),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("http://shift.test/page");
  await page.waitForTimeout(800);

  const shifts = await readShifts(page);
  expect(sessionCls(shifts)).toBeGreaterThan(LIMIT);
  expect(shifts.some((s) => s.nodes.some((n) => n.includes("Текст")))).toBe(true);
});

test.describe("публичные страницы на боевой сборке", () => {
  test.skip(!BASE, "SITE_PERF_BASE_URL не задан: CLS страниц меряют по боевой сборке");

  for (const screen of SCREENS) {
    test.describe(screen.name, () => {
      test.use({
        baseURL: BASE,
        viewport: screen.viewport,
        deviceScaleFactor: screen.deviceScaleFactor,
        isMobile: screen.isMobile,
        hasTouch: screen.hasTouch,
      });

      for (const path of PAGES) {
        test(`${path}: CLS при загрузке и прокрутке не больше ${LIMIT}`, async ({ page }) => {
          await observeShifts(page);
          await page.goto(path, { waitUntil: "load" });
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(1500);

          const afterLoad = await readShifts(page);

          // Прокрутка до конца: ленивые картинки и блоки ниже первого экрана тоже не должны двигать страницу
          await page.evaluate(async () => {
            const height = document.documentElement.scrollHeight;
            for (let y = 0; y < height; y += Math.max(300, innerHeight * 0.8)) {
              scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 150));
            }
            scrollTo(0, height);
            await new Promise((resolve) => setTimeout(resolve, 500));
          });
          const afterScroll = await readShifts(page);

          const detail = (list: Shift[]) => list.map((s) => `${s.t}мс ${s.v.toFixed(4)} ${s.nodes.join(" | ")}`).join("\n");
          expect(sessionCls(afterLoad), `сдвиги при загрузке:\n${detail(afterLoad)}`).toBeLessThanOrEqual(LIMIT);
          expect(sessionCls(afterScroll), `сдвиги с прокруткой:\n${detail(afterScroll)}`).toBeLessThanOrEqual(LIMIT);
        });
      }
    });
  }
});
