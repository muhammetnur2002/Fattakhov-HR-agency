'use client';

import { motion } from 'framer-motion';
import { useReducedMotionSafe } from '@/lib/hooks/useReducedMotionSafe';
import { cn } from '@/lib/utils';
import { easeOutExpo } from '@/lib/motion';

/**
 * Кольцо совпадения.
 *
 * Дуга прочерчивается один раз при появлении карточки. Число внутри —
 * не украшение: это единственное место, где студент видит, почему
 * вакансия оказалась наверху ленты.
 */
export function MatchRing({
  value,
  size = 44,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotionSafe();
  const stroke = size >= 44 ? 3 : 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;

  // Порог, а не градиент: «68%» и «72%» не должны выглядеть по-разному.
  // Цвета — роли темы, а не фиксированные hex: прежние светлые (#71D9AC, #8DA3B9) на светлой
  // шапке карточки почти сливались с ней, как и дорожка rgba(248,248,248,.1)
  const tone =
    value >= 75
      ? 'rgb(var(--color-yes-glow))'
      : value >= 50
        ? 'rgb(var(--color-accent-300))'
        : 'rgb(var(--color-graphite-300))';

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      title={`Совпадение с вашим профилем — ${value}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--color-paper) / 0.14)"
          strokeWidth={stroke}
        />
        {/*
          key по режиму: `initial` framer-motion запоминает в момент монтирования и потом не
          пересматривает. Хук отдаёт `false` на первом (гидратационном) рендере и настоящее значение
          сразу следом; без key у человека с «уменьшением движения» дуга уже стартовала бы с нуля и
          прочерчивалась 1,1 с. С key элемент пересоздаётся с initial={false} и сразу стоит на месте.
        */}
        <motion.circle
          key={reduced ? 'still' : 'draw'}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.15 }}
        />
      </svg>
      {/* Кольцо лежит на шапке карточки (SwipeCard/VacancyDetail): в светлой теме она
          светло-серая, белая цифра давала там 2,9:1 — цвет роли paper, как у остального текста шапки. */}
      <span
        // Число — ступень шкалы шрифтов, а не доля от кольца (size × 0,29 давала 12,76 и 15,08 px)
        className={cn('absolute font-medium tabular-nums leading-none text-paper', size < 48 ? 'text-caption' : 'text-small')}
      >
        {Math.round(value)}
      </span>
    </span>
  );
}
