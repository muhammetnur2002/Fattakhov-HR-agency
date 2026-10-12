import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn, FIELD_HOVER } from "@/lib/utils";

/**
 * Обычный `<select>` в оформлении кабинета.
 *
 * Для коротких списков в формах и фильтрах, где Radix-`Select` не нужен: родной элемент работает
 * с клавиатуры, на телефоне открывает системный выбор и уходит с формой без единой строки кода
 * (`name`, `required`, `defaultValue`, GET-форма без скриптов). Раньше таких `<select>` было 14
 * штук, у каждого свой класс: у половины не было ни отключённого вида, ни тёмной темы, у других —
 * наведения или кольца ошибки. Теперь вид один — тот же, что у `Input` и `SelectTrigger`.
 *
 * `className` уходит на обёртку (ширина, отступы), остальные пропсы — на сам `select`.
 * Сырой `<select>` в разметке запрещён (`tests/field-components.test.ts`).
 */
function NativeSelect({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  size?: "default" | "sm";
}) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative inline-flex w-fit max-w-full min-w-0", className)}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "peer w-full min-w-0 appearance-none rounded-lg border border-field bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none md:text-sm",
          "data-[size=default]:h-8 data-[size=sm]:h-7",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:not-focus-visible:ring-destructive/20",
          // Незаполненный обязательный список читается как подсказка, а не как выбранное значение
          "required:invalid:text-muted-foreground",
          // Раскрытый список рисует система: фон берём из токена, иначе в тёмной теме он белый
          "[&>option]:bg-popover [&>option]:text-popover-foreground",
          "dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:not-focus-visible:ring-destructive/40",
          FIELD_HOVER,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </div>
  );
}

export { NativeSelect };
