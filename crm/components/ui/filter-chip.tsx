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
 * `globals.css`): высоту чипа не меняем.
 *
 * Место под галочку занято у ВСЕХ чипов (решение владельца, 16.10.2026): слева стоит слот
 * 14 точек плюс зазор 4 (`Mark`), у невыбранного он пустой, у выбранного в нём галочка,
 * у ожидающего — спиннер. Ширина чипа от выбора, ожидания и снятия не меняется, соседи
 * не двигаются, а в переносимом ряду строки не перестраиваются. До этого выбор растил
 * нажатый чип на 18 точек (на ноутбуке 22,5) и сужал прежний выбранный на столько же: чипы
 * между ними сдвигались ровно на эту ширину (замер до правки, семь экранов), а на границе
 * строки переносимого ряда такой сдвиг мог перестроить строки. Цена — каждый невыбранный
 * чип на 18 точек шире, а слева от подписи пустое место: так решено, не «чинить» обратно.
 */

const BASE =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:translate-y-px touch:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

/**
 * Не выбран: контурный, как `Button outline`. В тёмной теме рамка — `--field` (3:1 к поверхности), а не
 * `--input`: заливка выбранного к невыбранному там всего 3,01:1, и держать отличие на сотых нельзя —
 * к заливке и галочке добавляется заметная рамка у невыбранных.
 */
const UNSELECTED =
  "border-border bg-background text-foreground hover:bg-muted active:bg-muted-active dark:border-field dark:bg-input/30 dark:hover:bg-input/50 dark:active:bg-muted-active";

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

/**
 * Круглая галочка выбора с занятым местом: у невыбранной карточки на её месте пустой слот того же размера (20 точек).
 * Условный монтаж (`{selected && <SelectionCheck />}`) менял ширину строки заголовка: на 320 точках название первого
 * тарифа от галочки переносилось на строку, карточка росла на 16 точек и сдвигала все, что ниже (замер 16.10.2026).
 * Тот же принцип, что у слота `Mark` в чипе: место под значок занято всегда, значок появляется в нём.
 */
export function SelectionSlot({ selected, className }: { selected: boolean; className?: string }) {
  if (selected) return <SelectionCheck className={className} />;
  return <span data-slot="selection-slot" aria-hidden className={cn("size-5 shrink-0", className)} />;
}

/**
 * Слот перед подписью: ожидание (спиннер), выбор (галочка) или пусто. Слот стоит у каждого чипа
 * всегда — пустой он занимает те же 14 точек, что и галочка (плюс `gap` чипа), поэтому ширина
 * чипа не зависит от состояния. Не картинка и не текст: `aria-hidden`, в порядок фокуса не входит,
 * читалка и копирование текста его не видят — состояние говорит `aria-current` / `aria-pressed` /
 * `aria-selected` на самом чипе. Пустой слот без значка, а не невидимая галочка: невидимый значок
 * остался бы в дереве и сломал бы проверку «галочка у выбранного и только у него».
 */
function Mark({ selected, pending }: { selected: boolean; pending: boolean }) {
  return (
    <span
      aria-hidden
      data-slot="filter-chip-mark"
      className="inline-flex size-3.5 shrink-0 items-center justify-center"
    >
      {pending ? (
        <Loader2Icon data-slot="filter-chip-pending" className="animate-spin motion-reduce:animate-none" />
      ) : selected ? (
        <CheckIcon data-slot="filter-chip-check" />
      ) : null}
    </span>
  );
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
