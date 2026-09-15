import { viewerFromSession } from '@/lib/chat';
import { subscribeThreadEvents } from '@/lib/events';
import { getSession } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Живой поток событий переписки (SSE).
 *
 * Выбран вместо вебсокетов: односторонний канал — ровно то, что здесь
 * нужно, и он работает через обычный HTTP-роут, без отдельного сервера.
 * Отправка сообщений идёт обычным POST.
 *
 * Клиент умеет и без него — при обрыве переходит на опрос по таймеру,
 * так что поток улучшает ощущение, но не является обязательным.
 */
export async function GET(request: Request) {
  const viewer = viewerFromSession(await getSession());
  if (!viewer) {
    return new Response('Требуется вход в систему', { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // enqueue после закрытия потока бросает — а закрыть его может
      // клиент в любой момент, поэтому каждая запись защищена
      const push = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* поток уже закрыт */
        }
      };
      const send = (payload: unknown) => push(`data: ${JSON.stringify(payload)}\n\n`);

      send({ kind: 'ready' });
      unsubscribe = subscribeThreadEvents(viewer, send);

      // Прокси и балансировщики рвут молчащее соединение примерно через
      // минуту; комментарий каждые 25 секунд держит канал живым
      heartbeat = setInterval(() => push(': keep-alive\n\n'), 25_000);

      request.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* уже закрыт */
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Отключает буферизацию в nginx — иначе события копятся и приходят пачкой
      'X-Accel-Buffering': 'no',
    },
  });
}
