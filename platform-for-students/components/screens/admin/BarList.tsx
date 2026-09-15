'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { easeOutExpo } from '@/lib/motion';
import { cn, plural } from '@/lib/utils';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Подсветить как закрытый исход (выход на работу) */
  tone?: 'default' | 'good' | 'muted';
}

/**
 * Горизонтальные полосы для одного показателя по нескольким категориям.
 *
 * Один цвет на все полосы намеренно: длина уже кодирует величину, и
 * второй раз кодировать её же оттенком — значит намекнуть на смысл,
 * которого нет. Цвет здесь появляется ровно там, где означает статус:
 * закрытый положительный исход.
 *
 * Полосы горизонтальные, потому что подписи — слова, а не даты:
 * вертикальные столбцы заставили бы наклонять текст.
 */
export function BarList({
  items,
  total,
  unit = ['отклик', 'отклика', 'откликов'],
}: {
  items: BarItem[];
  total?: number;
  unit?: [string, string, string];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const sum = total ?? items.reduce((acc, i) => acc + i.value, 0);

  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const ratio = item.value / max;
        const share = sum > 0 ? Math.round((item.value / sum) * 100) : 0;
        const active = hovered === item.key;

        return (
          <li
            key={item.key}
            onMouseEnter={() => setHovered(item.key)}
            onMouseLeave={() => setHovered(null)}
            className="relative"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'text-[13px] transition-colors duration-200',
                  active ? 'text-paper' : 'text-paper-dim',
                )}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-paper">
                {item.value}
                <span className="ml-1.5 text-[11.5px] text-paper-faint">{share}%</span>
              </span>
            </div>

            {/* Дорожка — поверхность, а не данные: она не участвует в кодировании */}
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-paper/[0.06]">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ratio }}
                transition={{ duration: 0.9, ease: easeOutExpo, delay: 0.1 + index * 0.06 }}
                style={{ transformOrigin: 'left' }}
                className={cn(
                  'h-full rounded-full transition-colors duration-200',
                  item.tone === 'good'
                    ? 'bg-yes'
                    : item.tone === 'muted'
                      ? 'bg-paper/20'
                      : active
                        ? 'bg-accent-300'
                        : 'bg-accent-400',
                )}
              />
            </div>

            {active && item.value > 0 && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="pointer-events-none absolute -top-1 right-0 z-10 -translate-y-full rounded-lg border border-[var(--hairline-strong)] bg-graphite-850 px-2.5 py-1.5 text-[11.5px] text-paper shadow-lift"
              >
                {item.value} {plural(item.value, ...unit)}
              </motion.span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Доля одного исхода на нейтральной дорожке.
 *
 * Не два цветных сегмента: в монохромном бренде два соседних оттенка
 * неразличимы для дальтоника (проверено валидатором палитры). Заполнена
 * доля «вправо», остальное — поверхность; обе величины подписаны.
 */
export function ShareBar({
  label,
  filledLabel,
  restLabel,
  filled,
  rest,
}: {
  label: string;
  filledLabel: string;
  restLabel: string;
  filled: number;
  rest: number;
}) {
  const total = filled + rest;
  const share = total > 0 ? filled / total : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-paper-dim">{label}</span>
        <span className="text-[13px] tabular-nums text-paper">{total}</span>
      </div>

      <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-paper/[0.06]">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: 1, ease: easeOutExpo, delay: 0.15 }}
          style={{ transformOrigin: 'left' }}
          className="h-full rounded-full bg-accent-400"
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-paper-dim">
          <span className="size-2 rounded-full bg-accent-400" aria-hidden />
          {filledLabel}: <span className="tabular-nums text-paper">{filled}</span>
          <span className="text-paper-faint">({Math.round(share * 100)}%)</span>
        </span>
        <span className="flex items-center gap-1.5 text-paper-faint">
          <span className="size-2 rounded-full bg-paper/20" aria-hidden />
          {restLabel}: <span className="tabular-nums">{rest}</span>
        </span>
      </div>
    </div>
  );
}
