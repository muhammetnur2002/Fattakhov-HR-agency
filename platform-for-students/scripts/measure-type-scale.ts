/**
 * Замер шкалы шрифтов в настоящем браузере.
 *
 *   npx tsx scripts/measure-type-scale.ts [--base http://localhost:3000] [--widths 1280,375,1024,768]
 *
 * Открывает 11 ключевых страниц платформы на каждой ширине, собирает вычисленный font-size всех
 * видимых текстовых узлов и полей ввода и проверяет:
 *   · каждый размер — ступень шкалы для этой ширины (lib/type-scale.ts, app/globals.css);
 *   · на странице не больше шести обычных размеров плюс один акцентный;
 *   · поле ввода на сенсорном экране — ровно 16px (не ступень шкалы: iOS Safari увеличивает страницу
 *     при фокусе на поле мельче 16px), а крупнее 16px — только с `data-keep-size`. Поля проверяются
 *     все, не только заполненные: пустое поле тоже должно быть не мельче 16px. Размер таких полей
 *     в счёт «обычных размеров» не идёт, а печатается отдельно (`+поля 16`).
 * Нарушение — код выхода 1 и список элементов, у которых размер не из шкалы.
 * `--scheme dark` — то же в тёмной теме (по умолчанию светлая).
 *
 * Нужны: запущенная платформа с демо-данными (`npm run db:seed`, вход student@demo.ru) и Playwright.
 * Playwright в зависимости платформы не входит (в CI он не нужен, замер ручной): поставьте
 * `npm i --no-save playwright && npx playwright install chromium` или укажите готовый путь —
 * PLAYWRIGHT_MODULE=/путь/к/playwright/index.mjs. Баннер cookie замеру не мешает, но входит в него:
 * по умолчанию он закрыт (`--banner` — оставить, как его видит новый посетитель).
 */
import { ACCENT_STEP, FONT_BREAKPOINTS, FONT_STEPS, type FontStep } from '../lib/type-scale';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('base', process.env.BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const WIDTHS = opt('widths', '1280,375')
  .split(',')
  .map((w) => Number(w.trim()))
  .filter(Boolean);
const KEEP_BANNER = args.includes('--banner');
const SCHEME = opt('scheme', 'light') === 'dark' ? 'dark' : 'light';

/** Размер поля ввода на сенсорном экране, px: правило `(pointer: coarse)` в app/globals.css, не ступень шкалы */
const TOUCH_FIELD_PX = 16;

/** Высота окна по ширине: ноутбук, телефон, планшет — как в замерах PR */
const heightFor = (w: number) => (w >= 1280 ? 720 : w >= 1024 ? 768 : w >= 768 ? 1024 : 667);

type Account = 'public' | 'student';
const PAGES: Array<{ key: string; path: string | null; account: Account }> = [
  { key: 'главная', path: '/', account: 'public' },
  { key: 'вход', path: '/login', account: 'public' },
  { key: 'регистрация', path: '/register', account: 'public' },
  { key: 'помощь', path: '/help', account: 'public' },
  { key: 'рейтинг вузов', path: '/institutions/rating', account: 'public' },
  { key: 'вузы', path: '/institutions', account: 'public' },
  // страница вуза: адрес берётся из списка, чтобы не зависеть от справочника
  { key: 'страница вуза', path: null, account: 'public' },
  { key: 'конфиденциальность', path: '/legal/privacy', account: 'public' },
  { key: 'лента', path: '/feed', account: 'student' },
  { key: 'профиль', path: '/profile', account: 'student' },
  { key: 'отклики', path: '/applications', account: 'student' },
];

/** Ступени шкалы на данной ширине окна: имя → размер в px */
function stepsAt(width: number): Record<FontStep, number> {
  let tier = 0;
  FONT_BREAKPOINTS.forEach((min, i) => {
    if (width >= min) tier = i;
  });
  return Object.fromEntries(Object.entries(FONT_STEPS).map(([name, sizes]) => [name, sizes[tier]])) as Record<FontStep, number>;
}

/**
 * Выполняется в странице: размер → сколько узлов и где (по четыре примера). Текстовые узлы и поля
 * ввода — мелкий текст в них не узел, но размер виден. Скрытое (display:none, нулевой размер,
 * .sr-only) не считается. Исходник — строка, а не функция: tsx при сборке дописывает в функции
 * вспомогательный вызов __name, которого в странице нет, и evaluate падает.
 */
const MEASURE_IN_PAGE = `(() => {
  const map = {};
  const fields = [];
  const hidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return true;
    return !!el.closest('.sr-only,script,style,noscript,[data-nextjs-toast],nextjs-portal');
  };
  const add = (el, label) => {
    if (hidden(el)) return;
    const cs = getComputedStyle(el);
    const key = parseFloat(cs.fontSize).toFixed(2).replace(/\\.?0+$/, '');
    const entry = (map[key] = map[key] || { n: 0, ex: [] });
    entry.n++;
    if (entry.ex.length < 4) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter((c) => /^text-/.test(c)).slice(0, 3).join(' ') : '';
      entry.ex.push('<' + el.tagName.toLowerCase() + (cls ? ' ' + cls : '') + '> «' + label.slice(0, 28) + '»');
    }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
    // текст внутри поля (содержимое textarea, option) — размер поля, он считается ниже
    if (text && node.parentElement && !node.parentElement.closest('textarea,select')) add(node.parentElement, text);
  }
  // поля — все видимые, не только с текстом: пустое поле на iOS увеличивает страницу при фокусе так же
  const selector = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=range]):not([type=color]),textarea,select';
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (hidden(el)) continue;
    const opt = el.options && el.options[el.selectedIndex];
    const label = el.value || el.getAttribute('placeholder') || (opt && opt.text) || el.getAttribute('name') || '';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter((c) => /^text-/.test(c)).slice(0, 3).join(' ') : '';
    fields.push({
      size: parseFloat(getComputedStyle(el).fontSize),
      keep: el.hasAttribute('data-keep-size'),
      where: '<' + el.tagName.toLowerCase() + (cls ? ' ' + cls : '') + '> «' + label.slice(0, 28) + '»',
    });
  }
  return { map, fields, coarse: matchMedia('(pointer: coarse)').matches };
})()`;

async function loadPlaywright(): Promise<{ chromium: { launch: () => Promise<any> } }> {
  const spec = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
  try {
    return await import(spec);
  } catch {
    console.error(
      `Playwright не найден (${spec}). Поставьте: npm i --no-save playwright && npx playwright install chromium,\n` +
        'или задайте PLAYWRIGHT_MODULE=/путь/к/playwright/index.mjs',
    );
    process.exit(2);
  }
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const problems: string[] = [];
  const rows: string[] = [];

  for (const width of WIDTHS) {
    const steps = stepsAt(width);
    const allowed = new Map(Object.entries(steps).map(([name, px]) => [px, name]));
    const touch = width < 768;
    for (const account of ['public', 'student'] as Account[]) {
      const context = await browser.newContext({
        viewport: { width, height: heightFor(width) },
        colorScheme: SCHEME,
        reducedMotion: 'reduce',
        hasTouch: touch,
        isMobile: touch,
      });
      await context.addInitScript(([keep, scheme]: [boolean, string]) => {
        try {
          localStorage.setItem('theme', scheme);
          if (!keep) {
            localStorage.setItem('fhr-students-cookie-choice', JSON.stringify({ choice: 'rejected', version: '2026-10-01', at: new Date().toISOString() }));
          }
        } catch {}
      }, [KEEP_BANNER, SCHEME] as [boolean, string]);

      if (account === 'student') {
        const login = await context.newPage();
        await login.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
        const status = await login.evaluate(async () => {
          const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'student@demo.ru', password: 'Demo12345!' }),
          });
          // Инструкция при первом заходе затемняет страницу — для замера её закрываем
          await fetch('/api/tour', { method: 'POST' });
          return r.status;
        });
        await login.close();
        if (status !== 200) {
          console.error(`Вход student@demo.ru не удался (${status}): нужна база с демо-данными (npm run db:seed)`);
          process.exit(2);
        }
      }

      for (const entry of PAGES.filter((p) => p.account === account)) {
        const page = await context.newPage();
        let path = entry.path;
        if (path === null) {
          await page.goto(`${BASE}/institutions`, { waitUntil: 'networkidle' });
          path = await page.evaluate(() => {
            const link = Array.from(document.querySelectorAll('a[href^="/institutions/"]')).map((a) => a.getAttribute('href') ?? '').find((h) => h !== '/institutions/rating');
            return link ?? '/institutions';
          });
        }
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2600); // заставка и появление блоков
        const measured = (await page.evaluate(MEASURE_IN_PAGE)) as {
          map: Record<string, { n: number; ex: string[] }>;
          fields: Array<{ size: number; keep: boolean; where: string }>;
          coarse: boolean;
        };
        await page.close();
        const found = measured.map;
        if (touch && !measured.coarse) problems.push(`${width}px ${entry.key}: окно не сенсорное ((pointer: coarse) не сработал) — замер полей недостоверен`);

        // Поля ввода. Сенсорный экран: ровно 16px (крупнее — только с data-keep-size), в шкалу и счёт не идут.
        // Мышь: поле — обычный текст шкалы, его размер входит в счёт, как и раньше.
        let touchFields = 0;
        for (const f of measured.fields) {
          if (measured.coarse) {
            touchFields++;
            const ok = f.keep ? f.size >= TOUCH_FIELD_PX : f.size === TOUCH_FIELD_PX;
            if (!ok) problems.push(`${width}px ${entry.key} (${path}): поле ${f.size}px на сенсорном экране — нужно ${TOUCH_FIELD_PX}px (iOS увеличит страницу при фокусе) — ${f.where}`);
            if (f.keep && f.size >= TOUCH_FIELD_PX && !allowed.has(f.size)) problems.push(`${width}px ${entry.key} (${path}): поле с data-keep-size ${f.size}px — не ступень шкалы — ${f.where}`);
            if (f.keep) {
              const entryFor = (found[String(f.size)] = found[String(f.size)] || { n: 0, ex: [] });
              entryFor.n++;
            }
          } else {
            const entryFor = (found[String(f.size)] = found[String(f.size)] || { n: 0, ex: [] });
            entryFor.n++;
            if (entryFor.ex.length < 4) entryFor.ex.push(f.where);
          }
        }

        const sizes = Object.keys(found).map(Number).sort((a, b) => a - b);
        const accent = steps[ACCENT_STEP];
        const regular = sizes.filter((s) => s !== accent);
        const label = `${String(width).padStart(4)}px  ${entry.key.padEnd(20)}`;
        const touchNote = touchFields ? `  +поля ${TOUCH_FIELD_PX} (${touchFields})` : '';
        rows.push(`${label} ${sizes.length} (${regular.length}+${sizes.length - regular.length})  ${sizes.map((s) => allowed.get(s) ? `${s}` : `${s}!`).join(' · ')}${touchNote}`);

        for (const size of sizes) {
          if (!allowed.has(size)) {
            problems.push(`${width}px ${entry.key} (${path}): ${size}px не ступень шкалы — ${found[String(size)].ex.join('; ')}`);
          }
        }
        if (regular.length > 6) problems.push(`${width}px ${entry.key}: ${regular.length} обычных размеров вместо шести`);
        if (sizes.length - regular.length > 1) problems.push(`${width}px ${entry.key}: больше одной акцентной ступени`);
      }
      await context.close();
    }
  }
  await browser.close();

  console.log('ширина  страница              размеров (обычных+акцент)  какие');
  for (const row of rows) console.log(row);
  if (problems.length) {
    console.log(`\nНарушения (${problems.length}):`);
    for (const p of problems) console.log('  ' + p);
    process.exitCode = 1;
  } else {
    console.log(`\nВсе ${rows.length} замеров укладываются в шкалу: не больше шести обычных размеров и одного акцентного.`);
  }
}

void main();
