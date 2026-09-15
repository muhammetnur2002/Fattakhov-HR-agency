'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/**
 * Счётчик, добегающий до значения.
 *
 * Пишем в DOM напрямую, минуя состояние React: перерисовывать дерево
 * шестьдесят раз в секунду ради одной строки — верный способ уронить
 * кадры на странице, где рядом крутятся другие анимации.
 *
 * Замедление к концу (easeOut) важнее длительности: именно оно читается
 * как «значение подсчитано», а не «число дёргается».
 */
export function CountUp({
  to,
  duration = 1.4,
  delay = 0,
  suffix = '',
  prefix = '',
  decimals = 0,
  className,
}: {
  to: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const format = (value: number) =>
      `${prefix}${value.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

    if (!inView) {
      node.textContent = format(0);
      return;
    }
    if (reduced) {
      node.textContent = format(to);
      return;
    }

    const controls = animate(0, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        node.textContent = format(value);
      },
    });
    return () => controls.stop();
  }, [inView, to, duration, delay, suffix, prefix, decimals, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
