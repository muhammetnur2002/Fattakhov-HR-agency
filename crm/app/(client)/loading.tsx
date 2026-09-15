import { Skeleton } from "@/components/ui/skeleton";

/**
 * Общий индикатор загрузки для всего кабинета клиента.
 *
 * Ни одна страница кабинета не показывала вообще ничего между кликом
 * по разделу и отрисовкой новой страницы: на быстрой сети незаметно,
 * на боевом сервере под нагрузкой — секунда молчания, в которую
 * кажется, что клик не сработал. Next.js подставляет этот файл через
 * Suspense на каждой навигации внутри группы `(client)` сам, без
 * дополнительной разметки на страницах.
 */
export default function ClientLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 bg-card px-5 py-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
