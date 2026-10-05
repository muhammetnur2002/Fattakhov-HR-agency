import type { AccountRecord } from '@/lib/db/types';
import { resolveSession } from './session-resolve';

/** Сторож живёт на тике keep-alive (раз в 25 с); проверка — на каждом седьмом: примерно раз в три минуты. */
export const RECHECK_EVERY_TICKS = 7;

/**
 * Сторож долгоживущего потока (SSE чата).
 *
 * Сессию проверяют при подключении, а поток живёт часами: сброс пароля или отключение учётки
 * иначе не закрыли бы уже открытое соединение, и человек продолжал бы получать чужие сообщения.
 * Поэтому на тике keep-alive раз в несколько тиков сессия сверяется с базой заново
 * (тем же resolveSession, что и при подключении), и поток закрывается, если она отозвана
 * или истекла. Сбой базы поток не рвёт: недоступная база не повод выбросить всех.
 */
export function createStreamGuard(
  token: string | undefined,
  accounts: { findById(id: string): Promise<AccountRecord | null> },
  onRevoked: () => void,
): () => Promise<void> {
  let ticks = 0;
  let closed = false;
  return async function tick() {
    if (closed) return;
    ticks += 1;
    if (ticks % RECHECK_EVERY_TICKS !== 0) return;
    try {
      const { user } = await resolveSession(token, accounts);
      if (!user) {
        closed = true;
        onRevoked();
      }
    } catch {
      /* база не ответила — проверим на следующем круге */
    }
  };
}
