'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { pageVariants } from '@/lib/motion';

/**
 * Переход между экранами.
 *
 * `mode="wait"` намеренно не используется: пауза на время выхода
 * старого экрана добавляет к каждому переходу лишние 300 мс, и
 * навигация начинает казаться медленнее, чем есть. Экраны на мгновение
 * накладываются — глаз этого не замечает, а скорость сохраняется.
 *
 * Накладываются они в одной ячейке сетки, а не встают друг под другом:
 * в обычном потоке уходящий экран продолжает занимать свою высоту, и
 * приходящий уезжает вниз на всю её длину — заголовок оказывается за
 * пределами экрана, а сверху остаётся пустое поле.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-full grid-cols-1 grid-rows-1 [&>*]:col-start-1 [&>*]:row-start-1">
      <AnimatePresence initial={false}>
        <motion.div
          key={pathname}
          variants={pageVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          className="min-h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
