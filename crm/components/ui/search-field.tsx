import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Поле поиска по списку: значок, ввод, рамка поля.
 *
 * Три копии в кабинете (диалоги агентства, диалоги студентов, поиск
 * студентов) рисовали рамку `border` — это 8% прозрачности, 1,2:1 к фону:
 * пустое поле читалось как полоса. И у внутреннего `input` стоял
 * `outline-none` без замены, поэтому с клавиатуры фокус не был виден совсем.
 * Здесь рамка полем (`border-field`, 3:1) и кольцо фокуса вокруг всей
 * плашки — через `focus-within`, потому что фокус получает вложенный input.
 */
export function SearchField({
  className,
  inputClassName,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /** Класс обёртки (ширина, отступы). */
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div
      data-slot="search-field"
      className={cn(
        "flex h-9 items-center gap-2 rounded-xl border border-field bg-muted/40 px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="text"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm outline-none touch:text-base placeholder:text-muted-foreground",
          inputClassName,
        )}
        {...props}
      />
    </div>
  );
}
