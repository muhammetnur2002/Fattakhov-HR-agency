"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNASSIGNED_RECRUITER } from "@/lib/labels";

const ALL = "__all__";

/** Фильтр по рекрутёру, привязанный к адресу (`?recruiterId=`) — тот же приём, что у VacancyStatusFilter. */
export function RecruiterFilter({
  recruiters,
}: {
  recruiters: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("recruiterId") ?? ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next && next !== ALL) params.set("recruiterId", next);
    else params.delete("recruiterId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-56" aria-label="Фильтр по рекрутёру">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все рекрутёры</SelectItem>
        {/* Отсутствие ведущего — такой же повод отфильтровать список,
            как и конкретный человек: с дашборда руководителя сюда ведёт
            плитка «Без рекрутёра», и фильтр обязан это состояние показывать */}
        <SelectItem value={UNASSIGNED_RECRUITER}>Без рекрутёра</SelectItem>
        {recruiters.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
