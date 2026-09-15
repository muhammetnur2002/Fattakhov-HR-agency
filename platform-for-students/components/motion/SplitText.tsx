'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { easeOutExpo } from '@/lib/motion';

/**
 * Пословное раскрытие заголовка из-под маски.
 *
 * Слова, а не буквы: побуквенная анимация на кириллице читается как
 * помеха связи, потому что глаз не успевает собрать слово. Маска —
 * настоящий overflow-контейнер, поэтому строка не «проявляется», а
 * выезжает из-за кромки: движение с физическим смыслом.
 */
export function SplitText({
  text,
  className,
  wordClassName,
  delay = 0,
  each = 0.055,
  as: Tag = 'h1',
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  each?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}) {
  const reduced = useReducedMotion();
  const words = text.split(' ');

  if (reduced) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="mask-reveal pb-[0.12em] pr-[0.26em]">
            <motion.span
              className={cn('inline-block', wordClassName)}
              initial={{ y: '108%' }}
              animate={{ y: '0%' }}
              transition={{
                duration: 0.85,
                ease: easeOutExpo,
                delay: delay + index * each,
              }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </span>
    </Tag>
  );
}

/** То же, но по появлению в зоне видимости — для секций ниже первого экрана. */
export function SplitTextInView({
  text,
  className,
  wordClassName,
  delay = 0,
  each = 0.055,
  as: Tag = 'h2',
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  each?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p';
}) {
  const reduced = useReducedMotion();
  const words = text.split(' ');

  if (reduced) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <motion.span
        aria-hidden
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        transition={{ staggerChildren: each, delayChildren: delay }}
      >
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="mask-reveal pb-[0.12em] pr-[0.26em]">
            <motion.span
              className={cn('inline-block', wordClassName)}
              variants={{
                hidden: { y: '108%' },
                show: { y: '0%', transition: { duration: 0.85, ease: easeOutExpo } },
              }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
