'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { easeOutExpo } from '@/lib/motion';

/**
 * Изометрический куб — геометрическая основа фирменного знака.
 *
 * Знак как таковой лежит в public/brand и используется в шапке; здесь
 * его каркас, который можно анимировать: рёбра прочерчиваются по
 * очереди, грани проступают следом. Декоративный элемент, не логотип.
 */

const OUTLINE = 'M 0,-60 L 52,-30 L 52,30 L 0,60 L -52,30 L -52,-30 Z';
const RIB_LEFT = 'M -52,-30 L 0,0';
const RIB_RIGHT = 'M 52,-30 L 0,0';
const RIB_DOWN = 'M 0,0 L 0,60';

interface CubeMarkProps {
  className?: string;
  /** Прочерчивать рёбра при появлении */
  animate?: boolean;
  strokeWidth?: number;
}

export function CubeMark({ className, animate = true, strokeWidth = 3 }: CubeMarkProps) {
  const reduced = useReducedMotion();
  const shouldAnimate = animate && !reduced;

  const draw = (delay: number) => ({
    initial: shouldAnimate ? { pathLength: 0, opacity: 0 } : false,
    animate: { pathLength: 1, opacity: 1 },
    transition: { pathLength: { duration: 1.1, ease: easeOutExpo, delay }, opacity: { duration: 0.2, delay } },
  });

  return (
    <svg
      viewBox="-64 -72 128 144"
      fill="none"
      aria-hidden
      className={cn('overflow-visible', className)}
    >
      <defs>
        <linearGradient id="cube-face-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F8F8F8" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#F8F8F8" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="cube-face-side" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#546E88" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#546E88" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Грани появляются после рёбер: сначала каркас, потом объём */}
      <motion.path
        d="M 0,-60 L 52,-30 L 0,0 L -52,-30 Z"
        fill="url(#cube-face-top)"
        initial={shouldAnimate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.85, ease: easeOutExpo }}
      />
      <motion.path
        d="M 52,-30 L 52,30 L 0,60 L 0,0 Z"
        fill="url(#cube-face-side)"
        initial={shouldAnimate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.95, ease: easeOutExpo }}
      />

      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path d={OUTLINE} {...draw(0)} />
        <motion.path d={RIB_LEFT} opacity={0.55} {...draw(0.35)} />
        <motion.path d={RIB_RIGHT} opacity={0.55} {...draw(0.45)} />
        <motion.path d={RIB_DOWN} opacity={0.55} {...draw(0.55)} />
      </g>
    </svg>
  );
}
