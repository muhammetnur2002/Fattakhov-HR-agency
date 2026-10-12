import { prisma } from "@/lib/db/prisma";

import { vkSendMessage } from "./vk-api";
import { recordVkEvent } from "./vk-events";
import { consumeVkLinkCode, vkLinkReply } from "./vk-link";

/**
 * Что делать с одним входящим сообщением сообщества — одно место для двух
 * источников: вебхука (Callback API, если ВК присылает события) и опроса
 * (lib/notifications/vk-poll.ts, работает без настроек в ВК).
 *
 * Модуль не знает про Next: его грузит и рабочий процесс (jobs/scheduler.ts),
 * а там нет ни запроса, ни окружения сервера.
 */

/** Ответить человеку должны быстро: ВК ждёт «ok» от вебхука и при задержке повторит событие. */
const REPLY_TIMEOUT_MS = 4000;
const SEEN_RETENTION_DAYS = 30;

export type IncomingVkMessage = {
  /** Тип события в журнале: message_new у вебхука, poll_message у опроса. */
  type: string;
  fromId: number;
  text: string;
  payload?: string;
  /** Номер сообщения в диалоге; нет — защиты от повтора нет (вебхук старого формата). */
  cmid?: number | null;
};

/**
 * Занять сообщение. Вернёт false, если его уже разобрали: так вебхук и опрос,
 * увидев одно сообщение, не ответят дважды (второй раз код уже погашен, и
 * человек получил бы «код не найден» вслед за «Готово»).
 */
export async function claimVkMessage(peerId: number, cmid: number): Promise<boolean> {
  try {
    await prisma.vkMessageSeen.create({ data: { peerId: String(peerId), messageId: cmid } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

/** Убрать записи старше срока хранения. */
export async function pruneVkSeen(now: Date = new Date()): Promise<void> {
  await prisma.vkMessageSeen.deleteMany({
    where: { at: { lt: new Date(now.getTime() - SEEN_RETENTION_DAYS * 86_400_000) } },
  });
}

/**
 * Разобрать сообщение и ответить человеку. Не бросает: сбой ВК или базы не
 * должен превращаться в повтор события и не должен ронять рабочий процесс.
 * Возвращает, было ли сообщение обработано (false — повтор или не от человека).
 */
export async function handleVkMessage(message: IncomingVkMessage): Promise<boolean> {
  const { type, fromId } = message;
  // Сообщения от самого сообщества и от других сообществ не привязываем
  if (!fromId || fromId <= 0) {
    await recordVkEvent(type, "ignored");
    return false;
  }

  try {
    if (typeof message.cmid === "number" && !(await claimVkMessage(fromId, message.cmid))) return false;

    const outcome = await consumeVkLinkCode(String(fromId), message.text ?? "", new Date(), {
      payload: message.payload,
    });
    await recordVkEvent(type, outcome.status);

    const token = process.env.VK_BOT_TOKEN?.trim();
    if (!token) return true;
    const reply = await vkSendMessage(token, String(fromId), vkLinkReply(outcome), REPLY_TIMEOUT_MS);
    if (!reply.ok) {
      await recordVkEvent(type, "reply-failed", reply.code);
      console.error(`vk-link: ответить не вышло, код ВК ${reply.code ?? "—"}`);
    }
    return true;
  } catch (error) {
    console.error("vk-link: не удалось обработать сообщение", error instanceof Error ? error.name : "");
    return false;
  }
}
