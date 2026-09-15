'use client';

import { motion } from 'framer-motion';
import { CubeMark } from '@/components/brand/CubeMark';
import { durations, easeOutExpo } from '@/lib/motion';

/**
 * Пустой раздел.
 *
 * Всегда говорит, что делать дальше, и даёт кнопку: «пока пусто» без
 * выхода — тупик, из которого человек уходит со страницы, а не в
 * следующий шаг.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.slow, ease: easeOutExpo }}
      className="glass mx-auto flex max-w-lg flex-col items-center rounded-4xl px-8 py-16 text-center"
    >
      <CubeMark className="h-16 w-16 text-paper/20" />
      <h2 className="mt-8 text-display-sm text-paper">{title}</h2>
      <p className="mt-3 max-w-[38ch] text-[14.5px] leading-relaxed text-paper-dim">{description}</p>
      {action && <div className="mt-8">{action}</div>}
    </motion.div>
  );
}
