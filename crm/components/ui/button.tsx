import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px touch:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 data-[loading=true]:opacity-100 aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:hover:bg-muted aria-disabled:active:bg-muted aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:not-focus-visible:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:not-focus-visible:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground active:bg-muted-active aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:active:bg-muted-active",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:bg-muted-active aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted-active aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 dark:active:bg-muted-active",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/30 active:text-destructive-active focus-visible:border-destructive focus-visible:ring-destructive dark:bg-destructive/20 dark:hover:bg-destructive/25 dark:active:bg-destructive/35",
        link: "text-primary underline-offset-4 hover:underline active:text-primary-active active:underline dark:active:text-foreground",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Кнопка. Состояния: обычное, наведение, нажатие, фокус с клавиатуры,
 * выключенное (бледнее), загрузка.
 *
 * Нажатие заметно на телефоне, где наведения нет: у каждого варианта свой
 * «нажатый» цвет, отличный от наведения (основная — `--primary-active`, темнее;
 * нейтральные — `--muted-active`; красная — гуще плашка и темнее текст; ссылка —
 * подчёркивание и тёмный текст), плюс на сенсорном экране кнопка чуть сжимается
 * (`scale-[0.98]`). Сдвиг на 1px и фон «как при наведении» (1,2:1) были почти
 * незаметны. Значения токенов проверяет `tests/contrast-tokens.test.ts`.
 *
 * Загрузка (`loading`) — не «выключенное»: цвет остаётся полным, слева
 * крутится индикатор, кнопка недоступна для нажатия (повторную отправку
 * блокирует и Enter, потому что у неё `disabled`) и объявляет `aria-busy`.
 * Раньше в кабинете было 36 одинаковых копий кнопки отправки, которые при
 * ожидании только меняли текст на «…» и бледнели, неотличимо от выключенной.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Идёт отправка: индикатор, кнопка недоступна, цвет остаётся полным. */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  // Со Slot индикатор не вставить — у него ровно один ребёнок
  const busy = loading && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={busy || undefined}
      aria-busy={busy || undefined}
      disabled={busy ? true : disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        // Slot принимает ровно одного ребёнка: второй (индикатор) его бы сломал
        children
      ) : (
        <>
          {busy && (
            <Loader2Icon
              aria-hidden
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            />
          )}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants }
