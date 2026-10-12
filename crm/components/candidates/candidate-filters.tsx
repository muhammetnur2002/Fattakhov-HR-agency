"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useListNavigation } from "@/components/shell/list-pending";
import { ListSearchInput, ListToolbar } from "@/components/shell/list-toolbar";
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
  const { navigate, pending } = useListNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [salaryFrom, setSalaryFrom] = useState(searchParams.get("sf") ?? "");
  const [salaryTo, setSalaryTo] = useState(searchParams.get("st") ?? "");
  // Что сейчас в адресе или уже ушло туда: с теми же значениями переходить некуда. Иначе при каждом
  // показе страницы (поля равны адресу) уходил бы переход на тот же адрес — с ожиданием списка и
  // объявлением «Список обновлён» без единого действия человека
  const sent = useRef({ q: query, sf: salaryFrom, st: salaryTo });

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
      const was = sent.current;
      if (query !== was.q || salaryFrom !== was.sf || salaryTo !== was.st) {
        sent.current = { q: query, sf: salaryFrom, st: salaryTo };
        // Новый фильтр — заново с первой страницы: иначе можно листать
        // страницу 3 узкого списка и не увидеть, что в нём всего 5 карточек
        params.delete("page");
        navigate(`${pathname}?${params.toString()}`);
      }
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ q: query, sf: salaryFrom, st: salaryTo }),
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, salaryFrom, salaryTo]);

  return (
    // Тот же шаблон, что у вакансий, клиентов и заявок (ListToolbar): поиск
    // первой строкой одной ширины со всеми списками, вилка зарплаты под ним.
    // Раньше поиск и вилка стояли рядом с lg и до него переносились сами —
    // и поле поиска было уже, чем у соседних разделов
    <ListToolbar
      search={
        <ListSearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, должность, компания…"
          label="Поиск по кандидатам"
          pending={pending}
        />
      }
      filters={
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={salaryFrom}
            onChange={(e) => setSalaryFrom(e.target.value)}
            placeholder="ЗП от"
            aria-label="Зарплата от"
            className={cn(NO_NUMBER_SPINNER, "min-w-0 flex-1 sm:w-28 sm:flex-none")}
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
            className={cn(NO_NUMBER_SPINNER, "min-w-0 flex-1 sm:w-28 sm:flex-none")}
          />
        </div>
      }
    />
  );
}
