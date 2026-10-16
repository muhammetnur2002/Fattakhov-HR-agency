'use client';

import { useState } from 'react';
import { cn, companyGradient, initials } from '@/lib/utils';

/**
 * Размер инициалов — ступень шкалы шрифтов, а не доля от размера аватара: доля (size × 0,34)
 * давала 13,6 / 15 / 15,6 / 17,7 px — размеры, которых больше нигде нет (README, «Шкала шрифтов»).
 */
function initialsStep(size: number): string {
  if (size < 36) return 'text-caption';
  if (size < 48) return 'text-small';
  if (size < 64) return 'text-body';
  return 'text-sub';
}

/**
 * Аватар человека или компании.
 *
 * Пока фото нет (а у студента его чаще всего нет), показываются инициалы
 * на детерминированной подложке: у одного и того же имени всегда один и
 * тот же оттенок, и список людей остаётся различимым без фотографий.
 */
export function Avatar({
  name,
  src,
  size = 44,
  rounded = 'full',
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  rounded?: 'full' | 'square';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <span
      className={cn(
        // companyGradient всегда тёмный (см. lib/utils.ts) — независимо от
        // темы страницы, поэтому инициалы, блик и рамка внутри тоже
        // фиксированные светлые, а не paper/hairline: те переворачиваются
        // в тёмный текст в светлой теме и пропадают на этой всегда-тёмной
        // подложке (ровно баг со скриншота — «GP» было не видно).
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden border',
        showImage ? 'border-[var(--hairline)]' : 'border-white/10',
        rounded === 'full' ? 'rounded-full' : 'rounded-2xl',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: showImage ? undefined : companyGradient(name),
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- файлы отдаёт защищённый роут, оптимизатор к нему не ходит
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className={cn('font-medium leading-none text-white/90', initialsStep(size))}>
          {initials(name)}
        </span>
      )}
      {/* Внутренний блик: без него аватар выглядит наклейкой поверх стекла.
          Над инициалами — фиксированный белый: подложка там всегда тёмная,
          в обеих темах. Над фото — обычный, зависящий от темы. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          showImage ? 'shadow-hairline' : 'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]',
        )}
        style={{ borderRadius: 'inherit' }}
      />
    </span>
  );
}
