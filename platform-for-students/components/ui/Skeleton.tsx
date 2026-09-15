import { cn } from '@/lib/utils';

/**
 * Скелетон с бликом.
 *
 * Форма повторяет будущий контент, а не абстрактные полоски: иначе в
 * момент подстановки данных страница дёргается, и загрузка ощущается
 * дольше, чем была.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('shimmer rounded-lg bg-paper/[0.045]', className)}
    />
  );
}

/** Заглушка карточки вакансии — по геометрии совпадает с настоящей. */
export function VacancyCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'glass flex h-full w-full flex-col gap-5 rounded-4xl p-6',
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="size-11 rounded-full" />
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-6 w-3/5" />
      </div>

      <Skeleton className="h-px w-full rounded-none" />

      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      <div className="mt-auto flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="surface flex items-center gap-4 rounded-2xl p-4" aria-hidden>
      <Skeleton className="size-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-7 w-24 rounded-full" />
    </div>
  );
}
