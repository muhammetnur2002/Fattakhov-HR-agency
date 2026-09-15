"use client";

import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Layout-эффект, безопасный на сервере: там измерять нечего. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
 * Счётчик писал в узел результат String(число), и «4 980 000»
 * превращалось в «4980000». На мелких значениях это незаметно,
 * а на главном числе первого экрана нечитаемо ровно там, где читать
 * обязаны. Формат один и тот же для разметки и для кадров анимации,
 * иначе число дёргается по ширине на последнем кадре.
 */
const format = new Intl.NumberFormat("ru-RU");

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
  const reduced = useReducedMotion();
  const count = useMotionValue(0);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (reduced || value === 0) {
      node.textContent = format.format(value);
      return;
    }

    let controls: { stop: () => void } | null = null;
    let unsubscribe: (() => void) | null = null;

    const run = () => {
      count.set(0);
      node.textContent = "0";
      unsubscribe = count.on("change", (current) => {
        node.textContent = format.format(Math.round(current));
      });
      // Замедление к концу: последние цифры должны успевать читаться
      controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });
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
      controls?.stop();
      unsubscribe?.();
    };
  }, [reduced, value, duration, count]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format.format(value)}
    </span>
  );
}
