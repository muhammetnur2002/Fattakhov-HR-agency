"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { copyToClipboard, selectText } from "@/lib/clipboard";

export type CopyStatus = "idle" | "copied" | "manual";

/**
 * Состояние кнопки «Копировать»: «Скопировано» на пару секунд или, если
 * буфер недоступен совсем, «Скопируйте вручную» и выделенный на экране
 * текст (`target`). Сама логика копирования — lib/clipboard.ts.
 */
export function useCopy({
  copiedMs = 2000,
  manualMs = 6000,
}: { copiedMs?: number; manualMs?: number } = {}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, target?: () => Element | null | undefined): Promise<CopyStatus> => {
      if (timer.current) clearTimeout(timer.current);
      const ok = await copyToClipboard(text);
      const next: CopyStatus = ok ? "copied" : "manual";
      setStatus(next);
      if (!ok) {
        // Цель, возможно, ещё не нарисована (скрытая ссылка раскрывается
        // по этому же отказу), поэтому выделяем через два кадра: React успевает отрисовать
        requestAnimationFrame(() => requestAnimationFrame(() => selectText(target?.())));
      }
      timer.current = setTimeout(() => setStatus("idle"), ok ? copiedMs : manualMs);
      return next;
    },
    [copiedMs, manualMs],
  );

  return { status, copy };
}
