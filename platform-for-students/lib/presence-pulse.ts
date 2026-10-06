import 'server-only';
import { shouldWritePresence } from '@/lib/presence';
import type { AccountRecord, DataStore } from '@/lib/db/types';
import { rateLimit } from '@/lib/security/rate-limit';

export type PulseResult = { written: boolean } | { limited: true; retryAfter: number };

/**
 * Пульс «я на платформе» для уже прочитанной учётной записи.
 *
 * Пишется всем: скрыть статус нельзя (effectiveShowPresence в lib/presence.ts),
 * сохранённое когда-то `showPresence=false` пульс не останавливает.
 *
 * Порядок важен. Сначала смотрим, пора ли писать (отметка не чаще раза в минуту),
 * и только перед настоящей записью тратим квоту. Раньше лимит стоял первым и считал
 * все запросы подряд, в том числе те, что ничего не пишут: четыре вкладки с пульсом
 * раз в минуту плюс пульс при каждом возврате к вкладке выбирали 240 в час, после чего
 * запись молча переставала идти, и активный человек превращался в «был(а) давно».
 * Теперь квота тратится только на записи — их не больше одной в минуту, 60 в час, —
 * а потолок в тысячу остаётся страховкой от сломанного клиента.
 */
export async function recordPulse(
  store: Pick<DataStore, 'accounts'>,
  account: AccountRecord | null,
  now: Date = new Date(),
): Promise<PulseResult> {
  // Учётки нет — сессия устарела. Молча не пишем: разбираться с этим
  // будет первый же защищённый экран, а не фоновый пульс
  if (!account) return { written: false };
  if (!shouldWritePresence(account.lastSeenAt, now)) return { written: false };

  const limit = await rateLimit('presence', account.id);
  if (!limit.ok) return { limited: true, retryAfter: limit.retryAfter };

  await store.accounts.setLastSeen(account.id, now);
  return { written: true };
}
