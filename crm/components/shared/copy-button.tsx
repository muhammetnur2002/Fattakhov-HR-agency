"use client";

import { Check, Copy } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { MANUAL_COPY_MESSAGE } from "@/lib/clipboard";
import { useCopy } from "@/lib/hooks/use-copy";

/**
 * Кнопка «Копировать» — одна на весь продукт.
 *
 * Не молчит ни при каком исходе: «Скопировано», если текст лёг в буфер,
 * и «Скопируйте вручную» с выделенным на экране полем (`targetRef`),
 * если буфер недоступен (старый браузер, http, встроенное окно). Раньше
 * шесть кнопок копировали каждая по-своему, и в пяти из них без
 * Clipboard API нажатие не делало ничего.
 *
 * `targetRef` — элемент с копируемым текстом на экране: при отказе его
 * содержимое выделяется. `onManual` — если текст на экране скрыт и его
 * надо показать (ссылка-приглашение): вызывается до выделения.
 */
export function CopyButton({
  text,
  targetRef,
  onManual,
  label = "Копировать",
  copiedLabel = "Скопировано",
  iconOnly = false,
  ariaLabel,
  variant = "outline",
  size = "sm",
}: {
  text: string;
  targetRef?: RefObject<Element | null>;
  onManual?: () => void;
  label?: string;
  copiedLabel?: string;
  /** Только значок: подпись уходит в aria-label, а исход слышит читалка из статуса. */
  iconOnly?: boolean;
  ariaLabel?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default" | "icon";
}) {
  const { status, copy } = useCopy();

  async function onClick() {
    const outcome = await copy(text, () => targetRef?.current);
    if (outcome === "manual") onManual?.();
  }

  const message =
    status === "copied" ? copiedLabel : status === "manual" ? MANUAL_COPY_MESSAGE : "";

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? (size === "sm" ? "icon-sm" : "icon") : size}
        variant={variant}
        onClick={onClick}
        aria-label={iconOnly ? (ariaLabel ?? label) : undefined}
        title={iconOnly ? (ariaLabel ?? label) : undefined}
        className={iconOnly ? undefined : "shrink-0 whitespace-nowrap"}
      >
        {status === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {!iconOnly && (status === "idle" ? label : message)}
      </Button>
      {/* Исход слышит и тот, кто не видит кнопку; для значка видимое слово — рядом */}
      <span role="status" className={iconOnly && message ? "text-xs text-muted-foreground" : "sr-only"}>
        {iconOnly ? message : status === "idle" ? "" : message}
      </span>
    </>
  );
}
