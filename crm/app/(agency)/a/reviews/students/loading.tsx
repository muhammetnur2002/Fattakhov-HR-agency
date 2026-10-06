import { Skeleton } from "@/components/ui/skeleton";

/** Пока платформа отвечает: скелет формы и пяти строк — чтобы страница не прыгала. */
export default function StudentsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Загружаем студентов">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-20" />
      </div>
      <ul className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-32 w-full rounded-xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}
