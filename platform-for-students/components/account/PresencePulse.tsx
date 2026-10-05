'use client';

import { useEffect } from 'react';

/**
 * Пульс «я на платформе».
 *
 * Живёт в общем каркасе, а не на экране переписки: человек может сидеть в
 * ленте, а собеседник в это время смотрит на его статус в диалоге.
 *
 * Молчит, пока вкладка спрятана. Фоновая вкладка, оставленная на ночь,
 * иначе показывала бы «в сети» до утра — это ровно та ложь, из-за которой
 * такому статусу перестают верить.
 *
 * При возврате к вкладке пульс идёт сразу, не дожидаясь минуты: человек
 * вернулся и, скорее всего, сейчас напишет.
 *
 * Ошибки сети глотаются. Пульс — не действие пользователя, и всплывшее
 * «не удалось» только отвлекло бы от того, что он делает.
 */
const EVERY_MS = 60_000;

export function PresencePulse() {
  useEffect(() => {
    let stopped = false;

    const ping = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        // Вкладку могут закрыть ровно в этот момент — пусть запрос уйдёт
        keepalive: true,
      }).catch(() => undefined);
    };

    ping();
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener('visibilitychange', ping);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  return null;
}
