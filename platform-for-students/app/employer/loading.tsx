import { ListRowSkeleton, Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="page-x mx-auto max-w-6xl pt-24">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-36 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
