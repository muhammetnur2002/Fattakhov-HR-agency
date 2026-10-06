import { prisma } from "@/lib/db/prisma";

/**
 * Журнал событий от сообщества ВКонтакте (webhook /api/webhooks/vk).
 *
 * Зачем. Привязка ВК держится на цепочке, которую целиком видно только
 * изнутри ВК: адрес подтверждён → включён тип «Входящие сообщения» →
 * секрет совпадает → ВК присылает событие → мы отвечаем. Рвётся цепочка
 * в любом звене, а снаружи это выглядит одинаково: «бот молчит». Журнал
 * показывает, до какого звена дошло: событий нет вообще (ВК не шлёт),
 * есть с неверным секретом, есть, но ответить человеку не вышло (код 901).
 *
 * Чего здесь нет намеренно: текста сообщений (в них коды привязки и
 * личная переписка) и страниц отправителей. Только тип события и исход.
 * Хранится 30 дней.
 *
 * Запись не бросает: журнал вспомогательный, и сбой базы на нём не должен
 * превращаться в ошибку для ВК — он ответил бы повтором события.
 */

export type VkEventOutcome =
  | "confirmed"
  | "linked"
  | "bad-code"
  | "greeting"
  | "not-a-code"
  | "expired"
  | "taken"
  | "too-many-attempts"
  | "forbidden-secret"
  | "ignored"
  | "reply-failed";

/** Сколько живут записи. */
export const VK_EVENT_RETENTION_DAYS = 30;

/**
 * Не больше стольких записей в минуту. Адрес открыт без входа, и без
 * потолка любой желающий раздувал бы таблицу запросами с верным номером
 * сообщества (он не секрет — стоит в адресе страницы).
 */
const MAX_PER_MINUTE = 30;

export async function recordVkEvent(
  type: string,
  outcome: VkEventOutcome,
  vkErrorCode: number | null = null,
  now: Date = new Date(),
): Promise<void> {
  try {
    const recent = await prisma.vkEvent.count({
      // Минута, которая заканчивается в `now`: ограничено и сверху тоже
      where: { at: { gt: new Date(now.getTime() - 60_000), lte: now } },
    });
    if (recent >= MAX_PER_MINUTE) return;

    await prisma.vkEvent.create({
      // Тип приходит снаружи — обрезаем, чтобы длинной строкой не раздули запись
      data: { type: type.slice(0, 40), outcome, vkErrorCode, at: now },
    });
    await prisma.vkEvent.deleteMany({
      where: { at: { lt: new Date(now.getTime() - VK_EVENT_RETENTION_DAYS * 86_400_000) } },
    });
  } catch (error) {
    console.error("vk-events: не удалось записать событие", error instanceof Error ? error.name : "");
  }
}

export type VkEventRow = {
  id: string;
  at: Date;
  type: string;
  outcome: string;
  vkErrorCode: number | null;
};

export async function listVkEvents(limit = 10): Promise<VkEventRow[]> {
  return prisma.vkEvent.findMany({
    orderBy: { at: "desc" },
    take: limit,
    select: { id: true, at: true, type: true, outcome: true, vkErrorCode: true },
  });
}

/** Человеческая подпись типа события. Незнакомый тип показываем как есть. */
export const VK_EVENT_TYPE_LABELS: Record<string, string> = {
  confirmation: "Подтверждение адреса",
  message_new: "Сообщение сообществу",
  message_allow: "Разрешил сообщения",
  message_deny: "Запретил сообщения",
  message_reply: "Ответ сообщества",
};

/** Что значит исход — и что делать, если он тревожный. */
export const VK_EVENT_OUTCOME_LABELS: Record<
  VkEventOutcome,
  { text: string; tone: "ok" | "warn" | "bad" }
> = {
  confirmed: { text: "адрес подтверждён", tone: "ok" },
  linked: { text: "страница привязана", tone: "ok" },
  "bad-code": { text: "код не найден", tone: "warn" },
  greeting: { text: "человека поприветствовали и объяснили, как привязать", tone: "ok" },
  "not-a-code": { text: "это не код — человеку напомнили, как привязать", tone: "ok" },
  expired: { text: "код истёк", tone: "warn" },
  taken: { text: "страница уже привязана к другому кабинету", tone: "warn" },
  "too-many-attempts": { text: "слишком много неверных кодов с одной страницы", tone: "warn" },
  "forbidden-secret": {
    text: "неверный секретный ключ — в ВК вписан не тот, что на сервере",
    tone: "bad",
  },
  ignored: { text: "событие принято, ничего делать не нужно", tone: "ok" },
  "reply-failed": { text: "не удалось ответить человеку", tone: "bad" },
};
