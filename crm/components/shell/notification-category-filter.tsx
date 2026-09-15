"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS, type EventCategory } from "@/lib/notifications/events";

const ALL = "__all__";

/** Фильтр по категории, тот же приём, что у VacancyStatusFilter (`?category=`). */
export function NotificationCategoryFilter({
  categories,
}: {
  categories: EventCategory[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("category") ?? ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next && next !== ALL) params.set("category", next);
    else params.delete("category");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-56" aria-label="Фильтр по категории">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все категории</SelectItem>
        {categories.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {CATEGORY_LABELS[cat]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
