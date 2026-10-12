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
import { LEAD_STATUS_LABELS } from "@/lib/labels";

const ALL = "__all__";

/** Фильтр по статусу заявки — тот же приём, что и VacancyStatusFilter. */
export function LeadStatusFilter() {
  const { navigate, pending } = useListNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("status") ?? ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next && next !== ALL) params.set("status", next);
    else params.delete("status");
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger pending={pending} className="w-full max-w-48" aria-label="Фильтр по статусу">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все статусы</SelectItem>
        {Object.entries(LEAD_STATUS_LABELS).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
