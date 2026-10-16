"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { formatNumber } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/** Layout-эффект, безопасный на сервере: там измерять нечего. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Кривая замедления `cubic-bezier(x1, y1, x2, y2)` — та же, что в CSS.
 *
 * Свой расчёт вместо библиотеки движения: счётчик был единственным, что тянуло `motion`
 * в страницы сайта (около 78 КБ до сжатия в первой загрузке главной, замер 13.10.2026),
 * а нужна ему одна кривая и один цикл кадров. Кабинеты, где `motion` нужен всерьёз
 * (доска, нижняя панель, мастер), его по-прежнему подключают сами.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Сначала метод Ньютона: кривая гладкая, обычно хватает двух-трёх шагов
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-5) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    // Запасной путь — деление отрезка пополам (ограниченное число шагов)
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-5) break;
      if (x > value) low = t;
      else high = t;
      t = (high - low) / 2 + low;
    }
    return sampleY(t);
  };
}

/** Замедление к концу: последние цифры должны успевать читаться. */
const EASE = cubicBezier(0.16, 1, 0.3, 1);

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Число, которое досчитывается.
 *
 * Главное правило здесь не про красоту, а про правду: неверная цифра
 * на экране хуже, чем отсутствие анимации. Поэтому в разметке сразу
 * стоит настоящее значение, и обнуляется оно ровно в тот момент, когда
 * начинается отсчёт. Нет JS, выключено движение, не сработал
 * наблюдатель - человек видит правильное число, а не ноль.
 *
 * Значение не хранится в состоянии React: перерисовывать дерево на
 * каждом кадре ради одной цифры незачем. Меняется textContent одного
 * узла, и React об этом не знает.
 */
/**
 * Разряды разделяем всегда.
 *
 * Счётчик писал в узел результат String(число), и «250 000»
 * превращалось в «250000». На мелких значениях это незаметно,
 * а на главном числе первого экрана нечитаемо ровно там, где читать
 * обязаны. Формат один и тот же для разметки и для кадров анимации,
 * иначе число дёргается по ширине на последнем кадре. Запись — `formatNumber`
 * из `lib/format-money.ts`, одна на весь продукт.
 */
export function CountUp({
  value,
  className,
  duration = 0.9,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (value === 0 || prefersReducedMotion()) {
      node.textContent = formatNumber(value);
      return;
    }

    let frame = 0;

    const run = () => {
      node.textContent = "0";
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / (duration * 1000));
        node.textContent = formatNumber(Math.round(value * EASE(progress)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        run();
      },
      { threshold: 0.6 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {formatNumber(value)}
    </span>
  );
}
