"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import * as React from "react";

import { useListBusy } from "@/components/shell/list-pending";
import { cn } from "@/lib/utils";

/**
 * Чип выбора — один компонент на все переключатели и фильтры кабинета.
 *
 * Было шесть способов выбрать одно из нескольких: кнопка `default`/`outline`
 * и `secondary`/`outline` внутри `asChild`, заливка цветом текста на доске,
 * основной цвет в переписке, `aria-pressed` на студентах и на аудите,
 * рамка вокруг карточки тарифа. Выбранное отличалось только заливкой, а
 * у ссылок-фильтров не было и `aria-current` — читалка экрана не говорила,
 * какой фильтр включён. У нейтральной заливки (`secondary`) контраст к
 * соседу 1,05:1: выбранный чип был почти неотличим от невыбранного.
 *
 * Схема выбора одна:
 * - заливка токеном `--primary` (≥3:1 к невыбранному в обеих темах,
 *   `tests/contrast-tokens.test.ts`);
 * - галочка перед подписью — форма, а не только цвет: видна тем, кто не
 *   различает оттенки, и остаётся в режиме высокой контрастности, где
 *   заливку система отбрасывает;
 * - разметка: у ссылки `aria-current="true"`, у кнопки `aria-pressed`,
 *   у вкладки (`role="tab"`) `aria-selected`.
 *
 * Размер — как у `Button size="sm"` (высота 28, на сенсорном экране от 2.4em,
 * `globals.css`): высоту чипа не меняем. Серверное ожидание (ссылка ведёт на
 * тот же список с другим фильтром) показывается там же, где потом встанет
 * галочка, — ширина при выборе не прыгает.
 */

const BASE =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:translate-y-px touch:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

/** Не выбран: контурный, как `Button outline`. */
const UNSELECTED =
  "border-border bg-background text-foreground hover:bg-muted active:bg-muted-active dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:active:bg-muted-active";

/** Выбран: заливка основным цветом (галочку рисует сам компонент). */
const SELECTED =
  "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active";

/** Квадратный вариант — оценка цифрой (аудит найма): без галочки, рамка и заливка те же. */
const SQUARE = "size-11 px-0 text-base font-semibold tabular-nums";

/**
 * Крупный вариант — главная навигация, а не фильтр: этапы воронки на телефоне. Не ниже 40 точек
 * (решение, закреплённое `mobile-shell.spec.ts`), и правило `min-height: 2.4em` из globals.css
 * его не сжимает (`[data-tall]` из него исключён).
 */
const TALL = "h-auto min-h-10 gap-2 px-4 text-sm";

export function filterChipClass({
  selected,
  shape = "chip",
  tall = false,
  className,
}: {
  selected: boolean;
  shape?: "chip" | "square";
  tall?: boolean;
  className?: string;
}): string {
  return cn(BASE, selected ? SELECTED : UNSELECTED, shape === "square" && SQUARE, tall && TALL, className);
}

/** Круглая галочка выбора — для крупных выбираемых карточек (тарифы), где чип не годится. */
export function SelectionCheck({ className }: { className?: string }) {
  return (
    <span
      data-slot="selection-check"
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground",
        className,
      )}
    >
      <CheckIcon className="size-3.5" />
    </span>
  );
}

/** Значок перед подписью: ожидание (спиннер) или выбор (галочка). Пусто — места не занимает. */
function Mark({ selected, pending }: { selected: boolean; pending: boolean }) {
  if (pending) {
    return <Loader2Icon aria-hidden data-slot="filter-chip-pending" className="animate-spin motion-reduce:animate-none" />;
  }
  if (selected) return <CheckIcon aria-hidden data-slot="filter-chip-check" />;
  return null;
}

/** Внутри `Link`: ожидание перехода читается из `useLinkStatus` и уходит в общее состояние списка. */
function LinkMark({ selected }: { selected: boolean }) {
  const { pending } = useLinkStatus();
  useListBusy(pending);
  return <Mark selected={selected} pending={pending} />;
}

type CommonProps = {
  /** Чип выбран. */
  selected: boolean;
  /** Показать значок ожидания (для кнопок; у ссылки он берётся из перехода сам). */
  pending?: boolean;
  /** Без галочки: у квадратной оценки цифрой. */
  shape?: "chip" | "square";
  /** Крупнее обычного чипа (от 40 точек): навигация по этапам воронки на телефоне. */
  tall?: boolean;
  className?: string;
  children: React.ReactNode;
};

export type FilterChipLinkProps = CommonProps & {
  href: string;
  scroll?: boolean;
  prefetch?: boolean;
  onClick?: undefined;
};

export type FilterChipButtonProps = CommonProps &
  Omit<React.ComponentProps<"button">, "children" | "className" | "type" | "aria-pressed" | "aria-selected"> & {
    href?: undefined;
    /** `tab` — для вкладок в `role="tablist"`: тогда `aria-selected` вместо `aria-pressed`. */
    role?: "tab";
  };

export function FilterChip(props: FilterChipLinkProps | FilterChipButtonProps) {
  return props.href !== undefined ? <ChipLink {...props} /> : <ChipButton {...props} />;
}

function ChipLink({ href, scroll, prefetch, selected, shape = "chip", tall, className, children }: FilterChipLinkProps) {
  return (
    <Link
      href={href}
      scroll={scroll}
      prefetch={prefetch}
      data-slot="filter-chip"
      data-selected={selected || undefined}
      data-tall={tall || undefined}
      aria-current={selected ? "true" : undefined}
      className={filterChipClass({ selected, shape, tall, className })}
    >
      {shape === "chip" ? <LinkMark selected={selected} /> : null}
      {children}
    </Link>
  );
}

function ChipButton({
  selected,
  pending = false,
  shape = "chip",
  tall,
  className,
  children,
  role,
  ...rest
}: FilterChipButtonProps) {
  const isTab = role === "tab";
  return (
    <button
      type="button"
      role={role}
      data-slot="filter-chip"
      data-selected={selected || undefined}
      data-tall={tall || undefined}
      aria-pressed={isTab ? undefined : selected}
      aria-selected={isTab ? selected : undefined}
      className={filterChipClass({ selected, shape, tall, className })}
      {...rest}
    >
      {shape === "chip" ? <Mark selected={selected} pending={pending} /> : null}
      {children}
    </button>
  );
}

/**
 * Ряд чипов одного фильтра с названием для читалки экрана.
 *
 * `role="group"` с подписью: без неё «Все», «Лиды», «Активные» — просто три
 * кнопки, и непонятно, что они выбирают. Переносится на следующую строку,
 * если не помещается (раньше `flex gap-2` без переноса выталкивал чипы за
 * край на телефоне).
 */
export function FilterChipGroup({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "aria-label" | "role"> & { label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="filter-chip-group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}
