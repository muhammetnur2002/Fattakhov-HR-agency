/**
 * Замер раскладки и движения в настоящем браузере — то, что источниковые проверки tests/unit.ts
 * видеть не могут: они читают классы и правила, а не то, что получилось на экране.
 *
 *   npx tsx scripts/measure-layout.ts [--base http://localhost:3000] [--only motion,date,wizard]
 *
 * Три проверки:
 *   motion — «уменьшение движения» в системе: за первые 3,5 с после загрузки кольцо совпадения
 *            на /feed и каркас куба на главной не должны менять значения (stroke-dashoffset,
 *            opacity). Для контроля то же без режима: там значения обязаны меняться, иначе
 *            «стоит» ничего не доказывает.
 *   date   — «Дата рождения» на /profile и /register при 320, 360, 375, 390 и 1280 px: самое
 *            длинное значение каждого списка («Сентябрь», «31», «2008») помещается в поле без
 *            обрезания, страница не шире окна; на 1280 день и год — прежние 86 и 106 px.
 *   wizard — /register на коротких телефонах, пять шагов, прокрутка в начале и до упора: кнопка
 *            темы не пересекается с «Далее / Создать профиль», и касание у правого края кнопки
 *            достаётся ей, а не кнопке темы.
 * Нарушение — код выхода 1 и список.
 *
 * Нужны: запущенная платформа с демо-данными (`npm run db:seed`, вход student@demo.ru) и Playwright
 * (в зависимости платформы он не входит — как у measure-type-scale.ts: `npm i --no-save playwright
 * && npx playwright install chromium` или PLAYWRIGHT_MODULE=/путь/к/playwright/index.mjs).
 * Лучше всего мерить сборку (`next build && next start`): в dev-режиме кадры идут медленнее.
 * Исходники для страницы — строки, а не функции: tsx дописывает в функции вспомогательный вызов
 * __name, которого в странице нет.
 */
import { REGISTRATION_DRAFT_KEY, serializeDraft } from '../lib/registration-draft';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('base', process.env.BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const ONLY = opt('only', 'motion,date,wizard').split(',').map((s) => s.trim());

const COOKIE = JSON.stringify({ choice: 'rejected', version: '2026-10-01', at: '2026-10-16T00:00:00.000Z' });

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

/** Вход студента — один раз на весь прогон: у входа есть ограничитель частоты (429 при частых попытках). */
let studentState: unknown = null;
async function loginOnce(browser: any): Promise<unknown> {
  if (studentState) return studentState;
  const context = await browser.newContext();
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
  if (status !== 200) {
    console.error(`Вход student@demo.ru не удался (${status}): нужна база с демо-данными (npm run db:seed); при 429 подождите минуту`);
    process.exit(2);
  }
  studentState = await context.storageState();
  await context.close();
  return studentState;
}

/** Контекст с закрытым баннером cookie и светлой темой; со входом студента, если нужен. */
async function openContext(browser: any, opts: { width: number; height: number; reduced: 'reduce' | 'no-preference'; student?: boolean; touch?: boolean }) {
  const touch = opts.touch ?? opts.width < 768;
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    colorScheme: 'light',
    reducedMotion: opts.reduced,
    hasTouch: touch,
    isMobile: touch && opts.width < 600,
    storageState: opts.student ? await loginOnce(browser) : undefined,
  });
  await context.addInitScript((cookie: string) => {
    try {
      localStorage.setItem('theme', 'light');
      localStorage.setItem('fhr-students-cookie-choice', cookie);
    } catch {}
  }, COOKIE);
  return context;
}

// ----- motion ---------------------------------------------------------------------------------

/** Каждый кадр 3,5 с: смещение штриха колец совпадения и прозрачность/штрих каркаса куба. */
const MOTION_SAMPLER = `(() => {
  window.__samples = [];
  const t0 = performance.now();
  const tick = () => {
    const t = performance.now() - t0;
    const rings = Array.from(document.querySelectorAll('circle[stroke-dasharray]')).map((c) => getComputedStyle(c).strokeDashoffset);
    const cubes = Array.from(document.querySelectorAll('svg[viewBox="-64 -72 128 144"] path')).map((p) => {
      const cs = getComputedStyle(p);
      return (+cs.opacity).toFixed(3) + '|' + cs.strokeDashoffset;
    });
    window.__samples.push({ rings, cubes });
    if (t < 3500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

/** Сколько раз за выборку менялось значение у каждого элемента (число различных значений). */
function distinctPerElement(samples: Array<Record<string, string[]>>, kind: 'rings' | 'cubes'): number[] {
  const count = Math.max(0, ...samples.map((s) => s[kind].length));
  return Array.from({ length: count }, (_, i) => new Set(samples.map((s) => s[kind][i]).filter((v) => v !== undefined)).size);
}

async function checkMotion(browser: any, problems: string[], rows: string[]) {
  // у стоящего элемента значений два: то, что нарисовал сервер до загрузки скриптов, и итоговое
  const STILL_MAX = 3;
  for (const [path, student, kind, what] of [
    ['/feed', true, 'rings', 'кольцо совпадения'],
    ['/', false, 'cubes', 'куб'],
  ] as const) {
    const result: Record<string, number[]> = {};
    for (const reduced of ['reduce', 'no-preference'] as const) {
      const context = await openContext(browser, { width: 1280, height: 720, reduced, student, touch: false });
      await context.addInitScript(MOTION_SAMPLER);
      const page = await context.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4200);
      const samples = (await page.evaluate('window.__samples')) as Array<Record<string, string[]>>;
      result[reduced] = distinctPerElement(samples, kind);
      await context.close();
    }
    const max = (list: number[]) => Math.max(0, ...list);
    rows.push(`движение  ${path.padEnd(6)} ${what}: reduce — до ${max(result.reduce)} разных значений, без режима — до ${max(result['no-preference'])}`);
    if (!result.reduce.length) problems.push(`motion ${path}: не нашёл элементов (${what}) — проверьте демо-данные`);
    if (max(result.reduce) > STILL_MAX) problems.push(`motion ${path}: при «уменьшении движения» ${what} меняет значение ${max(result.reduce)} раз (должно стоять, не больше ${STILL_MAX})`);
    if (max(result['no-preference']) <= 10) problems.push(`motion ${path}: без режима ${what} почти не меняется (${max(result['no-preference'])}) — замер ничего не доказывает`);
  }
}

// ----- date -----------------------------------------------------------------------------------

const DATE_IN_PAGE = `(() => {
  const fieldset = Array.from(document.querySelectorAll('fieldset')).find((f) => /Дата рождения/.test(f.querySelector('legend')?.textContent ?? ''));
  if (!fieldset) return null;
  const canvas = document.createElement('canvas').getContext('2d');
  const selects = Array.from(fieldset.querySelectorAll('select')).map((select) => {
    const cs = getComputedStyle(select);
    canvas.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const widest = Math.max(...Array.from(select.options).map((o) => canvas.measureText(o.text).width));
    const r = select.getBoundingClientRect();
    return {
      label: select.parentElement?.querySelector('label')?.textContent ?? '',
      width: Math.round(r.width),
      free: Math.round((select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * 10) / 10,
      widest: Math.round(widest * 10) / 10,
      top: Math.round(r.top),
    };
  });
  return { selects, overflow: document.documentElement.scrollWidth - innerWidth };
})()`;

async function checkDate(browser: any, problems: string[], rows: string[]) {
  for (const width of [320, 360, 375, 390, 1280]) {
    for (const [path, student] of [['/profile', true], ['/register', false]] as const) {
      const context = await openContext(browser, { width, height: width >= 1280 ? 720 : 800, reduced: 'reduce', student });
      const page = await context.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const found = (await page.evaluate(DATE_IN_PAGE)) as { selects: Array<{ label: string; width: number; free: number; widest: number; top: number }>; overflow: number } | null;
      await context.close();
      if (!found) {
        problems.push(`date ${width}px ${path}: не нашёл поле «Дата рождения»`);
        continue;
      }
      const line = found.selects.map((s) => `${s.label || '?'} ${s.width}px (запас ${Math.round((s.free - s.widest) * 10) / 10})`).join(' · ');
      const wrapped = new Set(found.selects.map((s) => s.top)).size > 1;
      rows.push(`дата      ${String(width).padStart(4)}px ${path.padEnd(10)} ${line}${wrapped ? ' · год на второй строке' : ''}`);
      for (const s of found.selects) {
        if (s.free < s.widest) problems.push(`date ${width}px ${path}: «${s.label}» ${s.width}px не вмещает самое длинное значение (${s.widest}px при ${s.free}px)`);
      }
      if (found.overflow > 0) problems.push(`date ${width}px ${path}: страница шире окна на ${found.overflow}px`);
      if (width === 1280) {
        const [day, , year] = found.selects;
        if (Math.abs(day.width - 86) > 2 || Math.abs(year.width - 106) > 2) problems.push(`date 1280px ${path}: день ${day.width}px, год ${year.width}px — на ноутбуке были 86 и 106`);
      }
    }
  }
}

// ----- wizard ---------------------------------------------------------------------------------

const WIZARD_IN_PAGE = `(() => {
  const btn = document.querySelector('button[form="registration-step-form"]');
  if (!btn) return null;
  const visible = (el) => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
  const toggles = Array.from(document.querySelectorAll('button[data-theme-toggle]')).filter(visible);
  const b = btn.getBoundingClientRect();
  let ix = 0, iy = 0, covered = 0, total = 0;
  for (const t of toggles) {
    const r = t.getBoundingClientRect();
    ix = Math.max(ix, Math.min(b.right, r.right) - Math.max(b.left, r.left));
    iy = Math.max(iy, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
  }
  for (let i = 0; i < 20; i++) for (let j = 0; j < 5; j++) {
    const x = b.left + b.width * (i + 0.5) / 20, y = b.top + b.height * (j + 0.5) / 5;
    if (y < 0 || y > innerHeight) continue;
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit.closest('button[data-theme-toggle]')) covered++;
  }
  return { text: btn.textContent.trim(), toggles: toggles.length, ix: Math.max(0, Math.round(ix)), iy: Math.max(0, Math.round(iy)), covered, total, right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), overflow: document.documentElement.scrollWidth - innerWidth, dark: document.documentElement.classList.contains('dark') };
})()`;

async function checkWizard(browser: any, problems: string[], rows: string[]) {
  const sizes: Array<[number, number]> = [[375, 667], [360, 640], [320, 568], [390, 844], [412, 915]];
  let combos = 0;
  let bad = 0;
  for (const [width, height] of sizes) {
    for (let step = 0; step < 5; step++) {
      for (const where of ['top', 'bottom'] as const) {
        const context = await openContext(browser, { width, height, reduced: 'reduce' });
        await context.addInitScript(([key, value]: [string, string]) => {
          try {
            sessionStorage.setItem(key, value);
          } catch {}
        }, [REGISTRATION_DRAFT_KEY, serializeDraft(step, {})]);
        const page = await context.newPage();
        await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        if (where === 'bottom') {
          await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
          await page.waitForTimeout(300);
        }
        const r = (await page.evaluate(WIZARD_IN_PAGE)) as {
          text: string; toggles: number; ix: number; iy: number; covered: number; total: number; right: number; top: number; bottom: number; overflow: number; dark: boolean;
        } | null;
        combos++;
        const label = `${width}x${height} шаг ${step + 1} ${where === 'top' ? 'вверху' : 'внизу'}`;
        if (!r) {
          bad++;
          problems.push(`wizard ${label}: нет кнопки «Далее»`);
          await context.close();
          continue;
        }
        // касание у правого края кнопки — если она на экране
        let swapped = false;
        if (r.top < height - 4) {
          const y = Math.min((r.top + r.bottom) / 2, height - 3);
          await page.touchscreen.tap(r.right - 6, y);
          await page.waitForTimeout(400);
          swapped = ((await page.evaluate("document.documentElement.classList.contains('dark')")) as boolean) !== r.dark;
        }
        const problem = r.covered > 0 || r.ix * r.iy > 0 || swapped || r.overflow > 0;
        if (problem) {
          bad++;
          problems.push(`wizard ${label} [${r.text}]: пересечение с кнопкой темы ${r.ix}x${r.iy}px, перехвачено ${r.covered} из ${r.total} точек${swapped ? ', касание у края сменило тему' : ''}${r.overflow > 0 ? `, страница шире окна на ${r.overflow}px` : ''}`);
        }
        await context.close();
      }
    }
  }
  rows.push(`мастер    ${combos} сочетаний (5 размеров × 5 шагов × прокрутка вверху и внизу), с проблемами: ${bad}`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const problems: string[] = [];
  const rows: string[] = [];
  if (ONLY.includes('motion')) await checkMotion(browser, problems, rows);
  if (ONLY.includes('date')) await checkDate(browser, problems, rows);
  if (ONLY.includes('wizard')) await checkWizard(browser, problems, rows);
  await browser.close();

  for (const row of rows) console.log(row);
  if (problems.length) {
    console.log(`\nНарушения (${problems.length}):`);
    for (const p of problems) console.log('  ' + p);
    process.exitCode = 1;
  } else {
    console.log('\nВсе замеры в норме.');
  }
}

void main();
