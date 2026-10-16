/**
 * Помощник tests/unit.ts (раздел «Уменьшение движения»): печатает серверную разметку компонентов,
 * которые ветвятся по «уменьшению движения», одним JSON.
 *
 *   REDUCE=1 tsx tests/ssr-reduced-motion.ts   — окно с matchMedia есть с загрузки модулей, как в браузере
 *   tsx tests/ssr-reduced-motion.ts            — окна нет, как на сервере
 *
 * Отдельный процесс нужен потому, что framer-motion решает «я в браузере» один раз, при загрузке
 * модуля: подставить window уже после неё в процессе самого теста — значит ничего не проверить.
 * Если разметка в двух запусках разная, React при гидратации выбросит серверный HTML (ошибка #418).
 */
import type { VacancyDTO } from '../lib/types';

async function main() {
  if (process.env.REDUCE === '1') {
    const list = (query: string) => ({
      matches: /prefers-reduced-motion/.test(query),
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    });
    const browser = globalThis as unknown as Record<string, unknown>;
    browser.window = { matchMedia: list, addEventListener() {}, removeEventListener() {} };
    // framer-motion, решив, что он в браузере, обращается к этим классам при создании узлов
    for (const name of ['Element', 'HTMLElement', 'SVGElement']) browser[name] = class {};
  }

  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { SplitTextInView } = await import('../components/motion/SplitText');
  const { CubeMark } = await import('../components/brand/CubeMark');
  const { MatchRing } = await import('../components/swipe/MatchRing');
  const { CountUp } = await import('../components/motion/CountUp');
  const { SwipeCard } = await import('../components/swipe/SwipeCard');

  const vacancy: VacancyDTO = {
    id: 'v1',
    title: 'Бариста',
    company: 'Кофейня «Север»',
    companyId: null,
    companyLogoUrl: null,
    summary: 'Готовить кофе и встречать гостей.',
    responsibilities: [],
    requirements: [],
    perks: [],
    learnings: [],
    team: null,
    photos: [],
    videoUrl: null,
    salaryFrom: 30000,
    salaryTo: 45000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: null,
    address: null,
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'PART_TIME',
    shiftDays: ['MON', 'TUE'],
    hoursPerWeek: 20,
    tags: ['кофе'],
    isHot: false,
    publishedAt: '2026-10-01T00:00:00.000Z',
    matchScore: 87,
    matchReasons: ['совпадают 2 из 2 ваших дней'],
  };

  const out: Record<string, string> = {
    SplitTextInView: renderToString(createElement(SplitTextInView, { text: 'Три шага вместо трёх недель' })),
    CubeMark: renderToString(createElement(CubeMark, {})),
    MatchRing: renderToString(createElement(MatchRing, { value: 87 })),
    CountUp: renderToString(createElement(CountUp, { to: 1200 })),
    SwipeCard: renderToString(
      createElement(SwipeCard, { vacancy, index: 0, isTop: true, onDecide: () => true, onOpen: () => {} }),
    ),
  };
  process.stdout.write(JSON.stringify(out));
}

void main();
