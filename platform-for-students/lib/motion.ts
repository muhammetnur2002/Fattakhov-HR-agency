import type { Transition, Variants } from 'framer-motion';

/**
 * Единый словарь движения.
 *
 * Пружины, а не длительности: интерфейс, где всё едет по кривой Безье
 * фиксированной длины, ощущается как слайд-шоу. Пружина реагирует на
 * скорость жеста — карточка, брошенная резко, и улетает резче.
 *
 * Три режима на весь продукт. Больше — и движение перестаёт читаться
 * как один почерк.
 */

/** Возврат карточки, раскрытие панелей — мягко, с еле заметным перелётом */
export const springSoft = {
  type: 'spring',
  stiffness: 220,
  damping: 30,
  mass: 0.9,
} as const satisfies Transition;

/** Нажатия, переключатели, чипы — быстро и без болтанки */
export const springSnappy = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const satisfies Transition;

/** Перестроение стопки карточек — тяжелее, чтобы читался вес */
export const springDeck = {
  type: 'spring',
  stiffness: 280,
  damping: 36,
  mass: 1.05,
} as const satisfies Transition;

export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const easeInOutQuint = [0.83, 0, 0.17, 1] as const;

export const durations = {
  micro: 0.16,
  fast: 0.28,
  base: 0.45,
  slow: 0.7,
} as const;

/**
 * Появление снизу — базовый жест всего продукта.
 *
 * Без размытия: анимировать filter на десятке карточек одновременно
 * значит перерисовывать их каждый кадр вне композитора. Расфокус хорошо
 * смотрится на одном элементе (см. stepVariants) и роняет кадры на списке.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo },
  },
};

/** Каскад. delayChildren даёт контейнеру проявиться раньше содержимого */
export function stagger(each = 0.07, delay = 0.05): Variants {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: each, delayChildren: delay },
    },
  };
}

/**
 * Переход между экранами.
 *
 * Только сдвиг и прозрачность: filter на контейнере всей страницы — самая
 * дорогая анимация из возможных, и она же оставляет после себя
 * `filter: blur(0px)`, который навсегда выносит экран в отдельный слой.
 */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo, staggerChildren: 0.06 },
  },
  exit: {
    opacity: 0,
    y: -8,
    // Уходящий экран лежит поверх приходящего, пока тает: без этого он
    // ловит нажатия, адресованные уже новому экрану.
    pointerEvents: 'none',
    transition: { duration: durations.fast, ease: easeInOutQuint },
  },
};

/** Шаги мастера регистрации: направление зависит от того, куда идём */
export const stepVariants: Variants = {
  hidden: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? 44 : -44,
    filter: 'blur(6px)',
  }),
  show: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: { duration: durations.base, ease: easeOutExpo, staggerChildren: 0.05 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? -44 : 44,
    filter: 'blur(6px)',
    transition: { duration: durations.fast, ease: easeInOutQuint },
  }),
};

/** Порог, за которым бросок карточки считается решением, а не оговоркой */
export const SWIPE = {
  /** Смещение в px, после которого карточка улетает без учёта скорости */
  distanceThreshold: 112,
  /** Скорость в px/s, при которой хватает и короткого рывка */
  velocityThreshold: 520,
  /** Насколько далеко за экран уводим карточку при вылете */
  flyOut: 1.35,
  /** Максимальный наклон карточки в градусах */
  maxRotate: 16,
} as const;
