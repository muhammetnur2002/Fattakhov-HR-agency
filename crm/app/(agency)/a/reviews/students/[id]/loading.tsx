import { Skeleton } from "@/components/ui/skeleton";

export default function StudentProfileLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Загружаем анкету">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-80 max-w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
