"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { useListNavigation } from "@/components/shell/list-pending";
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
  const { navigate, pending } = useListNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("category") ?? ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next && next !== ALL) params.set("category", next);
    else params.delete("category");
    params.delete("page");
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger pending={pending} className="w-full max-w-56" aria-label="Фильтр по категории">
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
