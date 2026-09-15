'use client';

import { motion, type Variants } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Каскадное появление.
 *
 * `Stagger` задаёт ритм, `Reveal` — отдельный элемент. Разделение нужно,
 * чтобы задержки считались от контейнера: расставленные вручную delay
 * рассыпаются, стоит добавить в список один элемент.
 *
 * `once: true` обязателен — блок, который переигрывает анимацию при
 * каждом проходе мимо, превращает прокрутку в мигание.
 */

export function Stagger({
  children,
  className,
  each = 0.07,
  delay = 0.05,
  inView = true,
  amount = 0.2,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  each?: number;
  delay?: number;
  inView?: boolean;
  amount?: number;
  as?: 'div' | 'ul' | 'section';
}) {
  const Component = motion[as];
  return (
    <Component
      variants={stagger(each, delay)}
      initial="hidden"
      {...(inView
        ? { whileInView: 'show', viewport: { once: true, amount } }
        : { animate: 'show' })}
      className={className}
    >
      {children}
    </Component>
  );
}

export function Reveal({
  children,
  className,
  variants = fadeUp,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
  as?: 'div' | 'li' | 'p' | 'h2' | 'span';
}) {
  const Component = motion[as];
  return (
    <Component variants={variants} className={className}>
      {children}
    </Component>
  );
}

/** Одиночное появление вне каскада — для блоков, у которых нет соседей. */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
