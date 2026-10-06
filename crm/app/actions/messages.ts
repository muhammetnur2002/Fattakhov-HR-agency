"use server";

import { revalidatePath } from "next/cache";

import { isClient } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { reserveAttempt } from "@/lib/security/db-limit";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  MessageError,
  markConversationRead,
  sendDirectMessage,
} from "@/lib/services/messages";

/** Сообщений в сутки на клиента. Живому человеку хватает с запасом. */
const CLIENT_MESSAGES_PER_DAY = 200;

export type MessageState = { error?: string; ok?: boolean };

/**
 * Отправка личного сообщения.
 *
 * Одно действие на оба кабинета: переписка одна и та же, разницу
 * делает только адрес страницы. Кому писать можно — решает
 * lib/services/messages, а не эта обёртка.
 */
export async function sendMessageAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const actor = await requireActor();

  // Потолок в минуту — всем; суточный — клиентам: им можно писать команде
  // агентства ещё до договора, и без потолка этим можно засыпать сотрудников
  const perMinute = await guardRate("message", actor.id);
  if (!perMinute.allowed) return { error: rateLimitMessage(perMinute.retryAfter) };
  if (isClient(actor)) {
    // Сутки — в базе: счётчик в памяти перезапуск обнулял бы
    const perDay = await reserveAttempt(`message:day:${actor.id}`, {
      limit: CLIENT_MESSAGES_PER_DAY,
      windowMs: 24 * 60 * 60_000,
    });
    if (!perDay.allowed) {
      return { error: "Сегодня вы отправили много сообщений. Продолжите завтра или позвоните в агентство" };
    }
  }

  const recipientId = String(formData.get("recipientId") || "");
  const body = String(formData.get("body") || "");

  try {
    await sendDirectMessage(actor, recipientId, body);
  } catch (error) {
    if (error instanceof MessageError) return { error: error.message };
    throw error;
  }

  // Обе стороны: отправитель видит своё сообщение, получатель — новое
  // в списке. Какой из путей открыт сейчас, действие не знает
  revalidatePath(`/messages/${recipientId}`);
  revalidatePath(`/a/messages/${recipientId}`);
  revalidatePath("/messages");
  revalidatePath("/a/messages");

  return { ok: true };
}

/** Открыли переписку — входящее в ней прочитано. */
export async function markConversationReadAction(otherUserId: string) {
  const actor = await requireActor();
  await markConversationRead(actor, otherUserId);
  // Счётчик «Сообщения» в сайдбаре живёт в общем каркасе (AppShell) —
  // без этого он остаётся прежним, пока не сработает другая ревалидация
  revalidatePath("/", "layout");
}
