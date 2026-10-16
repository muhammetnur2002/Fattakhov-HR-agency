/**
 * Рисует карточки страниц сайта для соцсетей и мессенджеров: `public/og/<страница>-<отпечаток>.png`, 1200x630.
 *
 * Зачем скрипт, а не картинка из редактора: заголовок на карточке должен совпадать с
 * `og.title` страницы (lib/marketing/seo.ts), а имя файла — с отпечатком этого текста.
 * Поменяли слова — тест `tests/site-seo.test.ts` красный, пока карточку не перерисовали
 * и старый файл не удалился; соцсети не показывают старую картинку из своего кеша,
 * потому что адрес новый.
 *
 * Шрифт и цвета — сайта, а не «похожие»: скрипт открывает настоящую страницу запущенного
 * сайта (шрифт Inter приходит с неё, на нём же набран весь сайт), подменяет содержимое
 * карточкой и снимает кадр. Отдельного файла шрифта в репозитории нет, и лицензию
 * на него таскать с собой не нужно.
 *
 * Запуск (сервер сайта должен работать; адрес — тот, на котором он слушает):
 *
 *   npm run dev -- -p 3200          # в одном терминале
 *   npm run og:cards -- http://localhost:3200
 *
 * Лишние `public/og/*.png`, которых нет в реестре страниц, скрипт удаляет.
 */
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { chromium } from "@playwright/test";

import { OG_SIZE, SITE_PAGE_KEYS, ogCard } from "../lib/marketing/seo";

const base = (process.argv[2] ?? "http://localhost:3200").replace(/\/+$/, "");
const outDir = join(process.cwd(), "public", "og");

// Фирменные цвета сайта: чёрное полотно (--brand-slate), фирменный акцент и белый текст.
// Лёгкое свечение акцентом сверху — тот же приём, что на странице входа (app/(public)/layout.tsx)
const ACCENT = "#546e88";

function markup(card: { eyebrow: string; headline: string }): string {
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Число и знак рубля не рвутся на две строки: «100 / 000 ₽» читается как два числа.
  // Предлог и союз из одной-двух букв («от», «за», «в», «а», «не») не остаются в конце строки
  const glue = (text: string) =>
    text
      .replace(/(\d) (?=\d)/g, "$1\u00a0")
      .replace(/ ₽/g, "\u00a0₽")
      .replace(/(^|[\s(«])([а-яёА-ЯЁ]{1,2}) (?=\S)/g, "$1$2\u00a0");

  return `
    <div id="og-card" style="
      position: fixed; inset: 0; width: ${OG_SIZE.width}px; height: ${OG_SIZE.height}px;
      background: #000; color: #fff; overflow: hidden; z-index: 2147483647;
      font-family: var(--font-sans), system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    ">
      <div style="
        position: absolute; inset: 0;
        background: radial-gradient(ellipse 85% 70% at 50% -15%, rgba(84, 110, 136, .38), transparent 70%);
      "></div>
      <div style="
        position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: ${ACCENT};
      "></div>
      <div style="
        position: absolute; inset: 0; padding: 64px 88px 72px 88px;
        display: flex; flex-direction: column; justify-content: space-between;
      ">
        <img src="${base}/brand/logo-light.png" alt="" style="height: 64px; width: auto; align-self: flex-start" />
        <div>
          <div style="
            font-size: 26px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase;
            color: rgba(255,255,255,.65);
          ">${escape(card.eyebrow)}</div>
          <div style="
            margin-top: 24px; max-width: 980px;
            font-size: 76px; line-height: 1.08; font-weight: 600; letter-spacing: -.02em;
            text-wrap: balance;
          ">${escape(glue(card.headline))}</div>
        </div>
      </div>
    </div>`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const cards = SITE_PAGE_KEYS.map((key) => ogCard(key));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: OG_SIZE, deviceScaleFactor: 1 });

    // Любая страница сайта подойдёт: нужен только её шрифт и стили
    await page.goto(`${base}/privacy`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    });

    for (const card of cards) {
      await page.evaluate((html) => {
        document.getElementById("og-card")?.remove();
        document.body.insertAdjacentHTML("beforeend", html);
      }, markup(card));

      // Шрифт подгружается по первому использованию (подмножества по алфавитам),
      // а картинки — по обращению: ждём и то и другое
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.querySelectorAll("#og-card img")].map((img) =>
            (img as HTMLImageElement).decode().catch(() => undefined),
          ),
        );
      });
      await page.waitForTimeout(400);

      await page.screenshot({
        path: join(process.cwd(), card.file),
        clip: { x: 0, y: 0, ...OG_SIZE },
      });
      console.log(`${card.file}: «${card.headline}»`);
    }
  } finally {
    await browser.close();
  }

  // Старые карточки — прежние тексты и прежние версии шаблона — убираем
  const keep = new Set(cards.map((card) => basename(card.file)));
  for (const name of readdirSync(outDir)) {
    if (name.endsWith(".png") && !keep.has(name)) {
      rmSync(join(outDir, name));
      console.log(`удалён устаревший ${name}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
