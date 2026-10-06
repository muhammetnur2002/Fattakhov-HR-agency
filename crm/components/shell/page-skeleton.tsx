import { Skeleton } from "@/components/ui/skeleton";

/**
 * Заготовка страницы на время перехода между разделами — общая для обоих
 * кабинетов (loading.tsx клиента и агентства).
 *
 * Без неё между нажатием и готовой страницей не менялось ничего: ни
 * экран, ни подсветка раздела в меню и нижней панели — адрес переключается,
 * только когда новая страница готова целиком. На быстрой сети незаметно,
 * на боевом сервере под нагрузкой — секунда молчания, в которую кажется,
 * что нажатие не сработало, и человек нажимает ещё раз.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Страница загружается" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
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
