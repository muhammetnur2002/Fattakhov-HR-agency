"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth/session";
import {
  MessageError,
  markConversationRead,
  sendDirectMessage,
} from "@/lib/services/messages";

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
}
