'use client';

import { useSyncExternalStore } from 'react';
import { PRESENCE_TICK_MS, formatPresence, presenceNow } from '@/lib/presence';
import { cn } from '@/lib/utils';

/**
 * Часы как внешний источник.
 *
 * Строка «был(а) 5 мин назад» обязана стареть сама: открытый диалог живёт
 * часами, и застывшая отметка врёт тем сильнее, чем дольше на неё смотрят.
 * Пересчёт — раз в полминуты от того же `lastSeenAt`; сам `lastSeenAt` приходит
 * свежим вместе с обновлением диалога (опрос раз в 20 секунд и событие потока,
 * см. ChatScreen и useLiveThreads), отдельных запросов компонент не делает.
 *
 * Подписка, а не `setState` в эффекте: времени у React нет, оно снаружи, и
 * `useSyncExternalStore` — ровно тот способ, которым React разрешает такое
 * читать, не вызывая каскад перерисовок.
 */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, PRESENCE_TICK_MS);
  return () => clearInterval(timer);
}

/** Номер шага. Меняется раз в полминуты — значит, и перерисовка раз в полминуты, не чаще. */
const currentTick = () => Math.floor(Date.now() / PRESENCE_TICK_MS);

/**
 * На сервере времени нет.
 *
 * Посчитай строку там — она разошлась бы с клиентской через секунду после
 * отправки страницы, и React сообщил бы об ошибке гидратации. Ноль
 * означает «ещё не в браузере»: до первого клиентского кадра не рисуем
 * ничего.
 */
const serverTick = () => 0;

/**
 * «В сети» или «был(а) …».
 *
 * Пустой `lastSeenAt` — это и «не заходил ни разу», и «скрыл статус», и
 * «не положено видеть». Во всех трёх случаях не рисуем ничего: строка
 * «был(а) давно» у того, кто просто спрятался, выдавала бы его.
 */
export function PresenceLine({
  lastSeenAt,
  className,
}: {
  lastSeenAt: string | null;
  className?: string;
}) {
  const tick = useSyncExternalStore(subscribe, currentTick, serverTick);

  if (!lastSeenAt || tick === 0) return null;

  const { online, text } = formatPresence(lastSeenAt, presenceNow(tick * PRESENCE_TICK_MS));

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {/*
        Два оттенка зелёного, а не один: яркий `yes-glow` сделан для
        тёмного фона и на светлой теме блёкнет до нечитаемого, тёмный
        `yes` на тёмном фоне глухой. Палитра даёт оба — берём по теме.
      */}
      {online && (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-yes dark:bg-yes-glow" />
      )}
      <span className={cn('truncate', online && 'text-yes dark:text-yes-glow')}>{text}</span>
    </span>
  );
}
