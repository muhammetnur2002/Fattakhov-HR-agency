import { NextResponse, type NextRequest } from "next/server";

import { recordVkEvent } from "@/lib/notifications/vk-events";
import { vkMessageOf, vkSendMessage, type VkMessage } from "@/lib/notifications/vk-api";
import {
  consumeVkLinkCode,
  secretsMatch,
  vkLinkReply,
} from "@/lib/notifications/vk-link";

/**
 * Callback API сообщества ВКонтакте: сюда ВК присылает события сообщества.
 *
 * Два события. «confirmation» — разовая проверка адреса при включении
 * Callback API: отвечаем строкой, которую выдаёт ВК. «message_new» —
 * человек написал сообществу; если это код привязки, привязываем страницу,
 * а на любое сообщение отвечаем — иначе бот выглядит мёртвым.
 *
 * Защита — секрет из настроек Callback API (VK_CALLBACK_SECRET) и id
 * сообщества (VK_GROUP_ID). Маршрут открыт без сессии (/api/webhooks),
 * поэтому без верного секрета отвечаем 403 и ничего не делаем.
 *
 * ВК ждёт ответ «ok» на любое принятое событие в течение нескольких
 * секунд; иначе повторяет его. Поэтому после проверки секрета отвечаем
 * «ok» всегда, даже если привязка не вышла: исход уходит человеку
 * сообщением, а не повтором. Каждое принятое событие и его исход
 * записываются в журнал (lib/notifications/vk-events.ts) — по нему
 * видно, доходит ли что-нибудь от ВК вообще.
 */

type VkEvent = {
  type?: string;
  group_id?: number;
  secret?: string;
  object?: { message?: VkMessage } & VkMessage;
};

/** Короткий срок на ответ человеку: ВК ждёт наше «ok» и при задержке повторит событие. */
const REPLY_TIMEOUT_MS = 4000;

export async function POST(request: NextRequest) {
  const groupId = process.env.VK_GROUP_ID?.trim().replace(/^-/, "");
  const secret = process.env.VK_CALLBACK_SECRET?.trim();
  const confirmation = process.env.VK_CALLBACK_CONFIRMATION?.trim();

  let event: VkEvent;
  try {
    event = (await request.json()) as VkEvent;
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  if (!groupId || !secret || !confirmation) {
    return new NextResponse("vk callback is not configured", { status: 503 });
  }
  // Чужое сообщество в журнал не пишем: его номер не наш, и записи были бы чужим шумом
  if (String(event.group_id ?? "") !== groupId) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const type = typeof event.type === "string" ? event.type : "unknown";

  if (type === "confirmation") {
    await recordVkEvent(type, "confirmed");
    return new NextResponse(confirmation, { status: 200 });
  }

  if (!secretsMatch(String(event.secret ?? ""), secret)) {
    await recordVkEvent(type, "forbidden-secret");
    return new NextResponse("forbidden", { status: 403 });
  }

  if (type === "message_new") {
    await answerMessage(type, vkMessageOf(event.object));
  } else {
    await recordVkEvent(type, "ignored");
  }

  return new NextResponse("ok", { status: 200 });
}

/**
 * Обработать сообщение и ответить человеку. Не бросает: сбой ВК или базы
 * не должен превращаться в повтор события.
 */
async function answerMessage(type: string, message: VkMessage | undefined) {
  const fromId = message?.from_id;
  // Сообщения от самого сообщества и от других сообществ не привязываем
  if (!fromId || fromId <= 0) {
    await recordVkEvent(type, "ignored");
    return;
  }

  try {
    const outcome = await consumeVkLinkCode(String(fromId), message?.text ?? "", new Date(), {
      payload: message?.payload,
    });
    await recordVkEvent(type, outcome.status);

    const token = process.env.VK_BOT_TOKEN?.trim();
    if (!token) return;
    const reply = await vkSendMessage(
      token,
      String(fromId),
      vkLinkReply(outcome),
      REPLY_TIMEOUT_MS,
    );
    if (!reply.ok) {
      await recordVkEvent(type, "reply-failed", reply.code);
      console.error(`vk-link: ответить не вышло, код ВК ${reply.code ?? "—"}`);
    }
  } catch (error) {
    console.error("vk-link: не удалось обработать сообщение", error instanceof Error ? error.name : "");
  }
}
