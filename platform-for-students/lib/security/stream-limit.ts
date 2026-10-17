/**
 * Предел одновременных потоков чата (SSE) на одного участника.
 *
 * Поток живёт часами и держит соединение к приложению; Caddy пускает к нему до 512 соединений.
 * Без предела один вошедший открывает их сотнями (цикл EventSource в консоли) и занимает все
 * слоты — чат перестаёт открываться у остальных. Десять потоков на человека — с запасом для
 * нескольких вкладок и телефона; сверх этого клиент возвращается к опросу по таймеру
 * (так он и устроен, см. components/chat).
 *
 * Счёт в памяти процесса: приложение работает одним экземпляром, а при нескольких предел
 * просто действует на каждый экземпляр отдельно.
 */
export const MAX_STREAMS_PER_VIEWER = 10;

const open = new Map<string, number>();

/** Занять слот. Возвращает функцию освобождения (повторный вызов безвреден) или null, если слотов нет. */
export function acquireStream(key: string, max: number = MAX_STREAMS_PER_VIEWER): (() => void) | null {
  const current = open.get(key) ?? 0;
  if (current >= max) return null;
  open.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (open.get(key) ?? 1) - 1;
    if (left <= 0) open.delete(key);
    else open.set(key, left);
  };
}

/** Только для проверок. */
export function openStreamsFor(key: string): number {
  return open.get(key) ?? 0;
}
