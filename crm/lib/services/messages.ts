import { isAgency, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { link } from "@/lib/notifications/links";
import { truncateBody } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/notify";

export class MessageError extends Error {}

export type Correspondent = {
  id: string;
  fullName: string;
  role: string;
  position: string | null;
  /** null — сотрудник агентства. */
  clientName: string | null;
};

export type DirectConversation = {
  user: Correspondent;
  lastMessage: { body: string; createdAt: Date; fromMe: boolean };
  unreadCount: number;
};

/**
 * Кому этот человек вправе написать.
 *
 * Правило то же, что у упоминаний в обсуждениях (listMentionableUsers),
 * и повторено оно намеренно: сотрудник клиента не должен даже видеть
 * имена сотрудников другой компании. Агентство работает со всеми,
 * поэтому видит всех; клиент — команду агентства и своих коллег.
 *
 * Себя в списке нет: переписка с самим собой — не функция, а способ
 * получить пустую беседу, из которой некуда деться.
 */
export async function listCorrespondents(
  actor: Actor,
): Promise<Correspondent[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      isActive: true,
      deletedAt: null,
      id: { not: actor.id },
      // Клиенту видны только агентство (clientId: null) и свои коллеги
      ...(isAgency(actor) ? {} : { OR: [{ clientId: null }, { clientId: actor.clientId }] }),
    },
    select: {
      id: true,
      fullName: true,
      role: true,
      position: true,
      client: { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    position: u.position,
    clientName: u.client?.name ?? null,
  }));
}

/** Может ли актор писать этому человеку — та же проверка, но точечная. */
export async function canWriteTo(
  actor: Actor,
  recipientId: string,
): Promise<boolean> {
  if (recipientId === actor.id) return false;

  const recipient = await prisma.user.findFirst({
    where: {
      id: recipientId,
      organizationId: actor.organizationId,
      isActive: true,
      deletedAt: null,
    },
    select: { clientId: true },
  });
  if (!recipient) return false;

  // Агентство пишет кому угодно внутри организации
  if (isAgency(actor)) return true;

  // Клиент — только агентству и своим коллегам
  return recipient.clientId === null || recipient.clientId === actor.clientId;
}

/**
 * Список личных бесед.
 *
 * Беседа не хранится отдельной строкой, поэтому собираем её здесь:
 * берём все сообщения актора и сворачиваем по собеседнику. Выборка
 * ограничена организацией — этого достаточно, потому что переписка
 * всегда адресная, и чужое сообщение в неё попасть не может.
 */
export async function listDirectConversations(
  actor: Actor,
): Promise<DirectConversation[]> {
  const messages = await prisma.directMessage.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [{ senderId: actor.id }, { recipientId: actor.id }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      body: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      readAt: true,
    },
  });

  type Acc = { last: (typeof messages)[number]; unread: number };
  const byUser = new Map<string, Acc>();

  for (const m of messages) {
    const otherId = m.senderId === actor.id ? m.recipientId : m.senderId;
    const acc = byUser.get(otherId);
    // Сообщения уже отсортированы по убыванию — первое встреченное
    // и есть последнее в беседе
    if (!acc) {
      byUser.set(otherId, { last: m, unread: 0 });
    }
    const entry = byUser.get(otherId)!;
    if (m.recipientId === actor.id && m.readAt === null) entry.unread += 1;
  }

  if (byUser.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    select: {
      id: true,
      fullName: true,
      role: true,
      position: true,
      client: { select: { name: true } },
    },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return [...byUser.entries()]
    .map(([userId, acc]) => {
      const u = userById.get(userId);
      if (!u) return null;
      return {
        user: {
          id: u.id,
          fullName: u.fullName,
          role: u.role,
          position: u.position,
          clientName: u.client?.name ?? null,
        },
        lastMessage: {
          body: acc.last.body,
          createdAt: acc.last.createdAt,
          fromMe: acc.last.senderId === actor.id,
        },
        unreadCount: acc.unread,
      };
    })
    .filter((c) => c !== null)
    .sort(
      (a, b) =>
        b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
    );
}

/** Переписка с одним человеком. null — писать ему нельзя. */
export async function listDirectMessages(actor: Actor, otherUserId: string) {
  if (!(await canWriteTo(actor, otherUserId))) return null;

  const messages = await prisma.directMessage.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { senderId: actor.id, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: actor.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, senderId: true, readAt: true },
  });

  return messages.map((m) => ({ ...m, fromMe: m.senderId === actor.id }));
}

/** Собеседник для шапки переписки. null — писать ему нельзя. */
export async function getCorrespondent(
  actor: Actor,
  userId: string,
): Promise<Correspondent | null> {
  if (!(await canWriteTo(actor, userId))) return null;

  const u = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: {
      id: true,
      fullName: true,
      role: true,
      position: true,
      client: { select: { name: true } },
    },
  });
  if (!u) return null;

  return {
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    position: u.position,
    clientName: u.client?.name ?? null,
  };
}

export async function sendDirectMessage(
  actor: Actor,
  recipientId: string,
  body: string,
) {
  const text = body.trim();
  if (!text) throw new MessageError("Сообщение пустое");
  if (text.length > 5000) {
    throw new MessageError("Сообщение слишком длинное, максимум 5000 символов");
  }

  if (!(await canWriteTo(actor, recipientId))) {
    throw new MessageError("Этому человеку написать нельзя");
  }

  const message = await prisma.directMessage.create({
    data: {
      organizationId: actor.organizationId,
      senderId: actor.id,
      recipientId,
      body: text,
    },
    select: { id: true },
  });

  const author = await prisma.user.findFirst({
    where: { id: actor.id },
    select: { fullName: true },
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: [recipientId],
    event: "NEW_MESSAGE",
    title: `${author?.fullName ?? "Коллега"} написал вам`,
    body: truncateBody(text, 200),
    linkUrl: link.messagesWith(actor.id),
    // Десять сообщений подряд — одно уведомление, а не десять
    groupKey: `dm:${actor.id}`,
  });

  return message;
}

/** Отмечает прочитанным всё входящее от этого человека. */
export async function markConversationRead(actor: Actor, otherUserId: string) {
  await prisma.directMessage.updateMany({
    where: {
      organizationId: actor.organizationId,
      senderId: otherUserId,
      recipientId: actor.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

/** Непрочитанные личные сообщения — для счётчика в меню. */
export async function countUnreadDirectMessages(actor: Actor): Promise<number> {
  return prisma.directMessage.count({
    where: {
      organizationId: actor.organizationId,
      recipientId: actor.id,
      readAt: null,
    },
  });
}
