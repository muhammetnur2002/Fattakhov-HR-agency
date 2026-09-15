"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn, NO_NUMBER_SPINNER } from "@/lib/utils";

const STORAGE_KEY = "candidateFilters";

/**
 * Поиск и диапазон зарплаты — вместе, привязаны к адресу.
 *
 * Фильтрация на сервере (BR-22), поэтому ввод не режет список сам,
 * а с задержкой обновляет URL, и уже это перерисовывает страницу.
 * Переключатель «Ждут решения» (`filter=`) живёт отдельно на странице —
 * этот компонент его не трогает, только дописывает свои параметры.
 *
 * Последний фильтр запоминается в localStorage: заход на страницу через
 * меню (а не по прямой ссылке с параметрами) подставляет его обратно,
 * иначе поиск и вилку приходилось набирать заново при каждом визите.
 */
export function CandidateFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [salaryFrom, setSalaryFrom] = useState(searchParams.get("sf") ?? "");
  const [salaryTo, setSalaryTo] = useState(searchParams.get("st") ?? "");

  /*
    Только при заходе на «голый» урл — если параметры уже в адресе
    (пришли по ссылке или после собственного изменения), они и главнее.

    Реальный переход адресной строки (не router.replace), а не запись
    в локальный стейт: этот компонент не переживает мягкую навигацию
    заново с уже восстановленными параметрами — инициализация query/
    salaryFrom/salaryTo выше срабатывает только при первом монтировании.
    Настоящий переход монтирует компонент заново, уже с нужным адресом.
  */
  useEffect(() => {
    if (searchParams.get("q") || searchParams.get("sf") || searchParams.get("st")) {
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && (saved.q || saved.sf || saved.st)) {
        const params = new URLSearchParams(searchParams);
        if (saved.q) params.set("q", saved.q);
        if (saved.sf) params.set("sf", saved.sf);
        if (saved.st) params.set("st", saved.st);
        window.location.replace(`${pathname}?${params.toString()}`);
      }
    } catch {
      // повреждённое значение — просто игнорируем, не поле жизни и смерти
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      const set = (key: string, value: string) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };
      set("q", query);
      set("sf", salaryFrom);
      set("st", salaryTo);
      // Новый фильтр — заново с первой страницы: иначе можно листать
      // страницу 3 узкого списка и не увидеть, что в нём всего 5 карточек
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ q: query, sf: salaryFrom, st: salaryTo }),
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, salaryFrom, salaryTo]);

  return (
    // Колонкой до lg: боковая панель кабинета съедает ~240px в любую
    // ширину экрана, и на sm (640px) — обычном планшете с открытым
    // сайдбаром — поиск и диапазон всё равно не помещались в ряд
    // и переносились сами, просто без видимой причины
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, должность, компания…"
          aria-label="Поиск по кандидатам"
          className="pl-8"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={salaryFrom}
          onChange={(e) => setSalaryFrom(e.target.value)}
          placeholder="ЗП от"
          aria-label="Зарплата от"
          className={cn(NO_NUMBER_SPINNER, "min-w-0 flex-1 lg:w-28 lg:flex-none")}
        />
        <span className="shrink-0 text-sm text-muted-foreground">—</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={salaryTo}
          onChange={(e) => setSalaryTo(e.target.value)}
          placeholder="до"
          aria-label="Зарплата до"
          className={cn(NO_NUMBER_SPINNER, "min-w-0 flex-1 lg:w-28 lg:flex-none")}
        />
      </div>
    </div>
  );
}
