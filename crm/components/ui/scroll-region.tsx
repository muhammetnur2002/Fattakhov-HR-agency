"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Горизонтально прокручиваемая обёртка, доступная с клавиатуры.
 *
 * Широкая таблица в `overflow-x-auto` прокручивается мышью и пальцем, а с
 * клавиатуры — нет: у контейнера прокрутки нет фокуса, стрелки ничего не
 * сдвигают, и правые колонки недосягаемы (проверка 11.10.2026). Лечится
 * фокусом на самом контейнере: tabIndex=0, а чтобы читалка назвала, куда
 * попал фокус, — role="region" с именем (label).
 *
 * Фокус и роль ставятся ТОЛЬКО пока содержимое действительно шире рамки.
 * Раньше обёртки были безусловными, и на телефоне, где таблицы раскладываются
 * блоками и вбок не двигаются, оставался пустой пункт в порядке Tab, а лишняя
 * «область» засоряла список ориентиров.
 *
 * className должен нести overflow-x-auto (или md:overflow-x-auto): сам
 * компонент прокрутку не включает, чтобы адаптивные случаи (прокрутка только
 * с md) остались в разметке страницы.
 */
export function ScrollRegion({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "aria-label" | "role" | "tabIndex"> & {
  /** Имя области для читалок: что именно прокручивается («Категории и цели…»). */
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setScrollable(node.scrollWidth > node.clientWidth + 1);
    measure();
    // Ширина окна, шрифт и содержимое меняются: сверяемся при каждом изменении размера.
    // Без наблюдателя (старый браузер, jsdom) остаётся замер при показе
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        // Кольцо фокуса — как у остальных элементов, но по контуру области
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
      {...(scrollable ? { role: "region", tabIndex: 0, "aria-label": label } : {})}
      {...props}
    >
      {children}
    </div>
  );
}
