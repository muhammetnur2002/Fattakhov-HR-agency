import { Loader2Icon, Search } from "lucide-react";
import type * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ширина поля поиска по списку — одна на все списки кабинета.
 *
 * Было пять разных на ноутбуке: 283 (вакансии, заявки — поле в ряду с
 * фильтрами сжималось до содержимого), 400 (кандидаты, `max-w-xs`),
 * 480 (клиенты, `max-w-sm`); подсказка внутри («Имя, компания, контакт…»)
 * на телефоне обрезалась. Теперь поле на всю ширину страницы, но не шире
 * `max-w-xl` (720 при корне 20px) — полтора раза от прежнего наибольшего.
 * Ширина одна у всех списков и при любой ширине окна: на узком экране это
 * просто ширина рабочей области.
 *
 * Значение здесь, а не в разметке страниц: правишь ширину — правишь везде.
 * `tests/search-rule.test.ts` не даёт вписать свою ширину в страницу.
 */
export const LIST_SEARCH_CLASS = "w-full max-w-xl";

/**
 * Поле поиска без поведения: значок, ввод, ширина списка.
 *
 * Поведение — у того, кто его рисует: `SearchField` привязывает ввод к адресу,
 * `CandidateFilters` — вместе с вилкой зарплаты. Вид и ширина у них общие.
 * Класса снаружи нет намеренно: ширину здесь не переопределяют.
 */
export function ListSearchInput({
  label,
  pending = false,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "className" | "type" | "aria-label"> & {
  /** Название поля для чтения с экрана: у подсказки внутри поля оно может быть длиннее. */
  label: string;
  /**
   * Запрос уже ушёл, список обновляется: на месте лупы крутится индикатор.
   * Лупа и индикатор — в одном и том же месте, поле при этом не двигается.
   */
  pending?: boolean;
}) {
  const iconClass =
    "pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground";
  return (
    <div data-slot="list-search" className={cn("relative", LIST_SEARCH_CLASS)}>
      {pending ? (
        <Loader2Icon
          aria-hidden
          data-slot="list-search-pending"
          className={cn(iconClass, "animate-spin motion-reduce:animate-none")}
        />
      ) : (
        <Search className={iconClass} />
      )}
      <Input type="text" aria-label={label} className="pl-8" {...props} />
    </div>
  );
}

/**
 * Панель «поиск + фильтры» над списком — один шаблон для кандидатов, клиентов,
 * заявок и вакансий у обеих сторон.
 *
 * Поиск — всегда первой строкой и всегда одной ширины; фильтры — под ним
 * одной строкой, если они есть. Раньше фильтры стояли рядом с поиском, и
 * ширина поиска зависела от того, сколько их и поместятся ли рядом: «Заявки»
 * с одним выбором и «Вакансии» с двумя выглядели по-разному, а на телефоне
 * поле сжималось до половины строки. Строка в строку — одинаково везде и
 * без исключений для ширины экрана.
 *
 * Серверный компонент без состояния: `search` и `filters` — готовые элементы.
 */
export function ListToolbar({
  search,
  filters,
}: {
  search: React.ReactNode;
  filters?: React.ReactNode;
}) {
  return (
    <div data-slot="list-toolbar" className="space-y-3">
      {search}
      {filters ? <div className="flex flex-wrap items-center gap-3">{filters}</div> : null}
    </div>
  );
}
