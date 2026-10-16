/**
 * Шкала шрифтов платформы: шесть обычных ступеней и одна акцентная.
 *
 * Единственное место, где перечислены имена ступеней и их размеры в пикселях. Из него читают:
 * `cn()` в lib/utils.ts (какие классы text-* — размер, а не цвет), tests/unit.ts и
 * scripts/measure-type-scale.mjs (сверка с tailwind.config.ts, app/globals.css и README).
 * Сами значения живут в app/globals.css (--fs-*): здесь они — зеркало для проверок, и тест
 * следит, чтобы зеркало не разошлось с CSS.
 *
 * Подробности и причины — README, раздел «Шкала шрифтов».
 */

/**
 * Ширины окна, с которых размеры меняются (min-width, px): телефон — уже 768px, планшет — от 768,
 * ноутбук — от 1280. Те же пороги в @media в app/globals.css.
 */
export const FONT_BREAKPOINTS = [0, 768, 1280] as const;

/** Имя ступени → [телефон, от 768px, от 1280px]. Размер в px при размере шрифта браузера 16px. */
export const FONT_STEPS = {
  caption: [12, 12, 12],
  small: [14, 14, 14],
  body: [15, 15, 15],
  sub: [18, 18, 18],
  title: [24, 28, 28],
  headline: [32, 44, 44],
  /** Акцентная ступень — только первый экран (герой) */
  display: [44, 56, 72],
} as const;

export type FontStep = keyof typeof FONT_STEPS;

/**
 * Метка капсом: тот же размер, что caption, плюс разрядка. Отдельное имя нужно только Tailwind
 * (там это токен с разрядкой) и `cn()`; в шкале это не новая ступень.
 */
export const FONT_STEP_ALIASES = ['eyebrow'] as const;

/** Все имена, которые Tailwind понимает как text-<имя> (размер шрифта) */
export const FONT_STEP_CLASSES: string[] = [...Object.keys(FONT_STEPS), ...FONT_STEP_ALIASES];

/** Акцентная ступень — одна */
export const ACCENT_STEP: FontStep = 'display';
