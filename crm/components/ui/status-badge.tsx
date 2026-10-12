import * as React from "react";

import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

/** Тон → вид бейджа. Единственное место, где цвет статуса становится классом. */
const TONE_VARIANT = {
  success: "success",
  progress: "progress",
  warning: "warning",
  danger: "destructive",
  neutral: "secondary",
} as const satisfies Record<StatusTone, React.ComponentProps<typeof Badge>["variant"]>;

/**
 * Бейдж статуса — единственный способ показать статус цветом.
 *
 * Тон (`success`, `progress`, `warning`, `danger`, `neutral`) берут из карт в `lib/status-tones.ts`
 * или выбирают по смыслу: красный (`danger`) — только отказ, ошибка и просрочка. Голый `<Badge>`
 * с цветом статуса вне этого компонента запрещён (`tests/status-badge-rule.test.ts`): им остаются
 * нейтральные метки — роль, навык, источник.
 *
 * `truncate` — для узкой колонки: длинный статус усекается многоточием, а не срезается краем
 * карточки, полный текст остаётся в подсказке. `max-w-full` бейджу, `truncate` внутреннему span;
 * `min-w-0` нарочно нет — с ним бейдж схлопывается в точку.
 */
export function StatusBadge({
  tone,
  truncate = false,
  className,
  children,
  title,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant" | "asChild"> & {
  tone: StatusTone;
  truncate?: boolean;
}) {
  return (
    <Badge
      variant={TONE_VARIANT[tone]}
      data-tone={tone}
      className={cn(truncate && "max-w-full", className)}
      title={title ?? (truncate && typeof children === "string" ? children : undefined)}
      {...props}
    >
      {truncate ? <span className="truncate">{children}</span> : children}
    </Badge>
  );
}
