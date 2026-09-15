"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VACANCY_STATUS_LABELS } from "@/lib/labels";

// Radix Select не даёт пустую строку как значение пункта (она зарезервирована
// под «ничего не выбрано») — используем сентинел и превращаем его в пустой
// параметр при записи в адрес.
const ALL = "__all__";

/**
 * Фильтр по статусу, привязанный к адресу (`?status=`), тем же приёмом,
 * что и SearchField — сервер уже умеет фильтровать (listVacancies), нужен
 * был только элемент управления.
 */
export function VacancyStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("status") ?? ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next && next !== ALL) params.set("status", next);
    else params.delete("status");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-48" aria-label="Фильтр по статусу">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все статусы</SelectItem>
        {Object.entries(VACANCY_STATUS_LABELS).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
