"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  className = "hidden w-64 md:block",
}: {
  hrefBase: string;
  defaultValue?: string;
  /** По умолчанию — как в шапке: скрыто на телефоне, узкое на десктопе. */
  className?: string;
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
    <form onSubmit={onSubmit} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Найти вакансию, кандидата…"
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
