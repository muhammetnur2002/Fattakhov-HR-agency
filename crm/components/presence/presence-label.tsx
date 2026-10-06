"use client";

import { useEffect, useState } from "react";

import { formatPresence, type PresenceInput } from "@/lib/presence";
import { cn } from "@/lib/utils";

/** Как часто пересчитываем строку: «был(а) 5 мин назад» сама себя не обновит. */
const TICK_MS = 30_000;

/**
 * Строка «В сети» / «был(а) вчера в 21:40» с зелёной точкой у «В сети».
 *
 * Рисуется только если сервер вообще отдал статус (Correspondent.presence
 * не null): скрытый человек сюда не доходит, и «давно» вместо него не
 * придумывается. Точка — украшение (aria-hidden): для экранного диктора
 * вся информация в тексте.
 *
 * Время пересчитывается в браузере, поэтому строка не «замерзает» на
 * моменте загрузки страницы; сама отметка обновляется вместе со страницей
 * (components/presence/presence-refresh.tsx). Первая отрисовка может
 * отличаться от серверной на минуту — suppressHydrationWarning.
 */
export function PresenceLabel({
  lastSeenAt,
  className,
}: {
  lastSeenAt: PresenceInput;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { online, text } = formatPresence(lastSeenAt, now);

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      data-presence={online ? "online" : "offline"}
    >
      {online && (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
      )}
      <span className="truncate" suppressHydrationWarning>
        {text}
      </span>
    </span>
  );
}
