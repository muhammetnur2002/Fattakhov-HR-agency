'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springSnappy } from '@/lib/motion';

/**
 * Выбираемая метка.
 *
 * Выбранное состояние показано и заливкой, и галочкой: на тёмном фоне
 * одна лишь смена оттенка плохо различима, а при дальтонизме — вовсе
 * не различима.
 */
export function Chip({
  selected = false,
  onToggle,
  children,
  className,
  size = 'md',
  disabled,
}: {
  selected?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const interactive = !!onToggle && !disabled;

  return (
    <motion.button
      type="button"
      role={onToggle ? 'checkbox' : undefined}
      aria-checked={onToggle ? selected : undefined}
      disabled={disabled}
      onClick={onToggle}
      whileHover={interactive ? { y: -1.5 } : undefined}
      whileTap={interactive ? { scale: 0.94 } : undefined}
      transition={springSnappy}
      className={cn(
        'relative inline-flex select-none items-center gap-1.5 rounded-full border font-medium',
        'transition-colors duration-300 ease-out-expo disabled:opacity-40',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
        selected
          ? 'border-accent-400/60 bg-accent-500/22 text-paper shadow-[0_0_0_1px_rgba(110,136,162,0.25),0_6px_20px_-8px_rgba(84,110,136,0.6)]'
          : 'border-[var(--hairline)] bg-graphite-900/50 text-paper/70 hover:border-paper/22 hover:text-paper',
        !interactive && 'cursor-default',
        className,
      )}
    >
      {onToggle && (
        <motion.span
          initial={false}
          animate={{ width: selected ? 14 : 0, opacity: selected ? 1 : 0 }}
          transition={springSnappy}
          className="overflow-hidden"
        >
          <Check className="size-3.5 text-accent-200" aria-hidden />
        </motion.span>
      )}
      {children}
    </motion.button>
  );
}

/** Неинтерактивная метка: тег вакансии, характеристика профиля. */
export function Tag({
  children,
  className,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'hot';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium leading-none',
        tone === 'neutral' && 'border-[var(--hairline)] bg-paper/[0.04] text-paper/65',
        tone === 'accent' && 'border-accent-500/35 bg-accent-500/15 text-accent-200',
        tone === 'hot' && 'border-warn/35 bg-warn/12 text-warn',
        className,
      )}
    >
      {children}
    </span>
  );
}
