import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Заголовок страницы — единственный h1 на ней.
 *
 * Класс `text-2xl font-semibold` был скопирован в 55 страниц, у части — с
 * вариантами (`break-words`, `text-lg`, `text-xl`): заголовок «плыл» от
 * раздела к разделу, а на входе и в регистрации h1 не было вовсе, и
 * читалка экрана начинала страницу с h2. Теперь вид один; нужен другой —
 * пропс, а не свой класс на месте.
 *
 * `compact` — заголовок боковой панели (список диалогов), он же h1 страницы,
 * но рядом с рабочей областью и поэтому на ступень мельче.
 */
export function PageTitle({
  className,
  compact = false,
  ...props
}: React.ComponentProps<"h1"> & { compact?: boolean }) {
  return (
    <h1
      data-slot="page-title"
      className={cn(compact ? "text-lg" : "text-2xl", "font-semibold", className)}
      {...props}
    />
  );
}
