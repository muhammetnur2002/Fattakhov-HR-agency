import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/*
  Результат отличается формой значка, а не только цветом (WCAG 1.4.1): ошибка — круг с «!»,
  успех — круг с галочкой, предупреждение — треугольник. Цвет без формы не читают ни при
  дальтонизме, ни в режиме высокой контрастности, где заливку система отбрасывает.

  Роль тоже разная: ошибку читалка объявляет сразу (alert), успех и предупреждение — вежливо,
  не перебивая (status). Раньше `Alert` был alert всегда, и «Сохранено» перебивало читалку,
  как отказ.
*/
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
        // Значок — цветом бренда (≥3:1 к карточке в обеих темах), текст — полным цветом
        success: "bg-card text-card-foreground *:data-[slot=alert-description]:text-card-foreground *:[svg]:text-primary",
        warning: "bg-card text-card-foreground *:data-[slot=alert-description]:text-card-foreground *:[svg]:text-card-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ICONS = {
  destructive: CircleAlertIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
} as const

function Alert({
  className,
  variant,
  icon,
  role,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /** Свой значок; `false` — без значка. По умолчанию значок задаёт вариант. */
    icon?: React.ReactNode | false
  }) {
  const Icon = variant ? ICONS[variant as keyof typeof ICONS] : undefined
  const glyph = icon === false ? null : (icon ?? (Icon ? <Icon aria-hidden /> : null))
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {glyph}
      {children}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
