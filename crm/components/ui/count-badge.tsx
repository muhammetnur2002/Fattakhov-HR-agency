import * as React from "react";

import { cn } from "@/lib/utils";

/** Число в кружке: «9+» от десяти. Одно правило вместо девяти копий. */
export function formatCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * Счётчик (непрочитанные сообщения, уведомления, ожидающие решения).
 *
 * Раньше на каждой панели был свой: кружок 15, 16, 18 и 20 пикселей, вес 500
 * и 600, красный то токеном, то литералом red-600. Теперь форма и текст одни,
 * различается только цвет под поверхность, на которой стоит.
 */
const TONES = {
  /** На светлой поверхности: непрочитанное в списках. */
  primary: "bg-primary text-primary-foreground",
  /** Требует внимания: колокольчик и вкладки. */
  alert: "bg-destructive text-destructive-foreground",
  /** На тёмной графитовой панели: белый кружок. */
  inverse: "bg-white text-brand-graphite",
  /** На активной плашке основного цвета. */
  onPrimary: "bg-primary-foreground text-primary",
} as const;

export function CountBadge({
  count,
  tone = "primary",
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  count: number;
  tone?: keyof typeof TONES;
  /**
   * Чего это число («непрочитанных», «новых»), для читалок экрана.
   *
   * Без подсказки число сливается с названием ссылки или строки, в которой
   * стоит: «Сообщения3», «Иванов2». С ней читалка слышит «, непрочитанных: 3» —
   * и точное число, а не «9+». Кружок при этом скрыт от читалки: число
   * не должно прозвучать дважды. Если подпись уже задана на самой ссылке
   * (aria-label, см. navLinkLabel в lib/nav.ts), label не нужен — там кружку
   * хватает aria-hidden.
   */
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-xs leading-none font-semibold tabular-nums",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {label ? (
        <>
          <span aria-hidden>{formatCount(count)}</span>
          <span className="sr-only">
            , {label}: {count}
          </span>
        </>
      ) : (
        formatCount(count)
      )}
    </span>
  );
}
