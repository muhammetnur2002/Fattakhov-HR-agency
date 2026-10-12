"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LIST_SEARCH_CLASS } from "./list-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ширина поиска в шапке: тянется на свободное место, но не шире `max-w-96`
 * (480 на ноутбуке) — полтора раза от прежних `w-64` (320). Прежняя
 * фиксированная ширина была узкой для подсказки: «Найти вакансию, кандидата…»
 * обрезалась на слове «кандидат», а на планшете поле сжималось до 233 —
 * рядом стояло имя пользователя (теперь оно видно только от xl, см. UserMenu).
 * На телефоне скрыто — там значок-ссылка (MobileSearchLink).
 */
export const HEADER_SEARCH_CLASS = "hidden min-w-0 md:block md:flex-1 md:max-w-96";

/**
 * Поиск по всему кабинету — в отличие от SearchField (который фильтрует
 * список на текущей странице), этот ведёт на отдельную страницу
 * результатов сразу по вакансиям, кандидатам и (у агентства) клиентам.
 * Раньше найти кандидата можно было только зайдя в правильный раздел
 * заранее — сквозного «где угодно» не было вовсе.
 */
export function GlobalSearchField({
  hrefBase,
  defaultValue = "",
  placement = "header",
}: {
  hrefBase: string;
  defaultValue?: string;
  /**
   * Где стоит поле: в шапке кабинета (по умолчанию) или на странице
   * результатов. Ширину выбирает место, а не вызывающий: класса снаружи нет,
   * чтобы поиск «в шапке» и «на странице» не расходился с остальными списками.
   */
  placement?: "header" | "page";
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`${hrefBase}/search?q=${encodeURIComponent(q)}`);
  }

  return (
    // Запрос в адресе — задуманный результат (`router.push` выше кладёт его туда же), поэтому без скриптов это
    // обычный GET на страницу поиска, а не форма, что перезагружала бы страницу с пустым `?`
    <form
      action={`${hrefBase}/search`}
      method="get"
      onSubmit={onSubmit}
      className={cn("relative", placement === "header" ? HEADER_SEARCH_CLASS : LIST_SEARCH_CLASS)}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Поиск по кабинету…"
        aria-label="Поиск по кабинету"
        className="h-8 pl-8 text-sm"
      />
    </form>
  );
}

/**
 * Мобильная замена GlobalSearchField в шапке: полю поиска там негде
 * поместиться рядом с гамбургером и иконками справа, а на странице
 * результатов оно уже есть отдельной формой (GlobalSearchField
 * с override className). Раньше на телефоне добраться до поиска
 * было вообще нечем.
 */
export function MobileSearchLink({ hrefBase }: { hrefBase: string }) {
  return (
    <Button variant="ghost" size="icon-sm" className="size-11 md:hidden" asChild>
      <Link href={`${hrefBase}/search`} aria-label="Поиск по кабинету">
        <Search className="size-5" />
      </Link>
    </Button>
  );
}
