import { ListRowSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Заглушка на время загрузки раздела. Повторяет геометрию списка, чтобы
 * при подстановке данных ничего не прыгало.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
