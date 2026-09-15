'use client';

import { useEffect, useRef } from 'react';

export interface LiveEvent {
  kind: 'ready' | 'message' | 'read' | 'poll';
  applicationId?: string;
}

/**
 * Живые обновления переписки.
 *
 * Два механизма разом, и это не подстраховка ради подстраховки: SSE даёт
 * мгновенность, редкий опрос — гарантию. Поток рвут прокси, спящие
 * вкладки и мобильные сети; заметить это на клиенте надёжно нельзя,
 * поэтому раз в двадцать секунд состояние сверяется в любом случае.
 * Если поток жив, опрос почти всегда не находит нового и стоит копейки.
 */
export function useLiveThreads(onEvent: (event: LiveEvent) => void): void {
  // Колбэк в ref: иначе каждая перерисовка родителя пересоздавала бы
  // соединение, и поток жил бы доли секунды
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;

    try {
      source = new EventSource('/api/messages/stream');
      source.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data) as LiveEvent);
        } catch {
          /* не наш формат — молчим */
        }
      };
      // EventSource переподключается сам; гасить его на первой же ошибке
      // значило бы терять поток из-за любой сетевой икоты
      source.onerror = () => {};
    } catch {
      /* браузер без SSE — останется опрос */
    }

    const reconcile = setInterval(() => handler.current({ kind: 'poll' }), 20_000);

    // Возврат на вкладку — самый частый момент, когда данные устарели
    const onVisible = () => {
      if (document.visibilityState === 'visible') handler.current({ kind: 'poll' });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      source?.close();
      clearInterval(reconcile);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
