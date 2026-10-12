import { prismaRaw } from "@/lib/db/prisma";

import { handleVkMessage, pruneVkSeen } from "./vk-inbox";
import { vkHistory, vkHumanError, vkMarkAsRead, vkRecentConversations } from "./vk-api";
import { recordVkEvent } from "./vk-events";

/**
 * Бот, которому не нужны настройки в ВКонтакте.
 *
 * Вебхук (Callback API) работает, только если в сообществе включены нужные
 * типы событий и сервер подтверждён; токен сообщества управлять этим не
 * может (методы Callback и Long Poll отдают код 15), так что починить
 * «бот молчит» из кода было нельзя: события просто не приходили. Поэтому
 * рабочий процесс сам раз в несколько секунд читает последние диалоги
 * сообщества — на это токену прав хватает, — разбирает сообщения тем же
 * обработчиком, что и вебхук, и отвечает. Повтор исключён таблицей уже
 * разобранных сообщений, так что вебхук и опрос спокойно живут вместе.
 *
 * Смотрим диалоги, где человек написал последним, независимо от «прочитано»:
 * администратор, открывший входящие сообщества, прочитывает сообщения
 * раньше нас. Цена вопроса — один небольшой запрос в 5 секунд (лимит ВК —
 * 20 в секунду) и один запрос в базу.
 */

export const POLL_INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** Один и тот же сбой в журнал — не чаще раза в десять минут. */
const FAILURE_LOG_EVERY_MS = 10 * 60_000;
/** Старше суток сообщение не разбираем: отвечать на позавчерашнее поздно и странно. */
const MAX_MESSAGE_AGE_S = 24 * 3600;
/** За один проход на один диалог — не больше стольких сообщений: ответы не должны превращаться в залп. */
const MAX_PER_DIALOG = 5;

export type PollResult = { handled: number; conversations: number } | { error: { code: number | null; message: string } };

/** Один проход: разобрать всё, что человек написал и на что ещё не ответили. Не бросает. */
export async function pollVkInboxOnce(token: string, nowMs: number = Date.now()): Promise<PollResult> {
  const recent = await vkRecentConversations(token);
  if (!recent.ok) return { error: { code: recent.code, message: recent.message } };

  const nowS = Math.floor(nowMs / 1000);
  // Диалоги, где последним писал человек (не сообщество) и достаточно недавно
  const waiting = recent.value.filter(
    (c) => c.last && c.last.out === 0 && c.last.fromId === c.peerId && c.last.cmid !== null && nowS - c.last.date <= MAX_MESSAGE_AGE_S,
  );
  if (waiting.length === 0) return { handled: 0, conversations: 0 };

  // Одним запросом: какие из последних сообщений уже разобраны
  const seen = await prismaRaw.vkMessageSeen.findMany({
    where: { OR: waiting.map((c) => ({ peerId: String(c.peerId), messageId: c.last!.cmid! })) },
    select: { peerId: true, messageId: true },
  });
  const seenKeys = new Set(seen.map((m) => `${m.peerId}:${m.messageId}`));
  const fresh = waiting.filter((c) => !seenKeys.has(`${c.peerId}:${c.last!.cmid}`));

  let handled = 0;
  for (const conversation of fresh) {
    const history = await vkHistory(token, conversation.peerId, MAX_PER_DIALOG * 2);
    if (!history.ok) return { error: { code: history.code, message: history.message } };

    // Новые первыми → разбираем по порядку отправки; только письма человека
    const incoming = history.value
      .filter((m) => m.out === 0 && m.from_id === conversation.peerId && nowS - m.date <= MAX_MESSAGE_AGE_S)
      .sort((a, b) => (a.conversation_message_id ?? a.id) - (b.conversation_message_id ?? b.id))
      .slice(-MAX_PER_DIALOG);

    for (const m of incoming) {
      const done = await handleVkMessage({
        type: "poll_message",
        fromId: m.from_id,
        text: m.text ?? "",
        payload: m.payload,
        cmid: m.conversation_message_id ?? null,
      });
      if (done) handled++;
    }
    // Чтобы в ВК у администратора не висел счётчик «непрочитанных» по тому, что бот уже разобрал
    if (incoming.length > 0) await vkMarkAsRead(token, conversation.peerId);
  }
  return { handled, conversations: fresh.length };
}

/** Запустить бесконечный опрос. Нет ключа сообщества — тихо ничего не делает. */
export function startVkInboxPoller(): void {
  const token = process.env.VK_BOT_TOKEN?.trim();
  if (!token) {
    console.info("[vk] ключ сообщества не задан — опрос сообщений не запущен");
    return;
  }

  let delay = POLL_INTERVAL_MS;
  let lastFailure = { key: "", at: 0 };
  let lastPrune = 0;

  const step = async () => {
    try {
      const result = await pollVkInboxOnce(token);
      if ("error" in result) {
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        const key = String(result.error.code);
        const now = Date.now();
        if (key !== lastFailure.key || now - lastFailure.at > FAILURE_LOG_EVERY_MS) {
          lastFailure = { key, at: now };
          console.error(`[vk] опрос не удался: ${vkHumanError(result.error.code) ?? result.error.message}`);
          await recordVkEvent("poll", "poll-failed", result.error.code);
        }
      } else {
        delay = POLL_INTERVAL_MS;
        if (result.handled > 0) console.info(`[vk] обработано сообщений: ${result.handled}`);
      }
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now();
        await pruneVkSeen();
      }
    } catch (error) {
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      console.error("[vk] сбой опроса", error instanceof Error ? error.name : "");
    }
    setTimeout(step, delay);
  };

  console.info(`[vk] бот проверяет сообщения сообщества каждые ${POLL_INTERVAL_MS / 1000} секунд`);
  void recordVkEvent("poll", "poll-started");
  setTimeout(step, 1000);
}
