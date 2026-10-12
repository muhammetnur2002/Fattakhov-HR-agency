import * as React from "react";

import { cn } from "@/lib/utils";

const TONES = {
  /** Врезка внутри карточки или формы: рамка и отступ. */
  plain: "",
  /** Приглушённая заливка: пояснение, служебный блок. */
  muted: "bg-muted/40",
  /** Выделенная: действие, на которое стоит обратить внимание. */
  accent: "border-primary/30 bg-secondary/40",
  /** Опасное действие или отказ. */
  danger: "border-destructive/40",
} as const;

/**
 * Врезка — блок с рамкой внутри карточки или страницы: форма внутри
 * карточки, пояснение, опасное действие.
 *
 * Было около 40 самодельных рамок `rounded-md|lg|xl border p-2.5…8` — пять
 * радиусов и девять отступов, и каждая «чуть другая». Теперь радиус один
 * (rounded-lg), отступ один (p-3), расстояние между детьми — space-y-3, а
 * различаются только тоном. Нужен другой вид — тон или className, а не
 * ещё одна копия. Блок побольше и со своим заголовком — это уже Card.
 *
 * Врезка-форма (`<form>`, а не div): `className={panelClass("plain", "space-y-4")}`.
 */
export function panelClass(tone: keyof typeof TONES = "plain", className?: string) {
  return cn("space-y-3 rounded-lg border p-3", TONES[tone], className);
}

export function Panel({
  tone = "plain",
  className,
  ...props
}: React.ComponentProps<"div"> & { tone?: keyof typeof TONES }) {
  return <div data-slot="panel" className={panelClass(tone, className)} {...props} />;
}
