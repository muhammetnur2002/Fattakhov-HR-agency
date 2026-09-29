import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/notify";
import { getActiveAgreement } from "@/lib/services/agreements";

/**
 * Удаление аккаунта клиента.
 *
 * Клиент без договора удаляет аккаунт сам и сразу: обязательств перед ним нет.
 * Клиент с договором отправляет запрос — аккаунт работает, пока владелец агентства
 * не подтвердит: за аккаунтом могут стоять счета, переписка по заявкам и обязательства.
 *
 * Удаление — обезличивание, а не стирание строки: почта, имя, телефон и секреты
 * обнуляются (152-ФЗ), а запись остаётся, чтобы не ломать историю комментариев,
 * счетов и вакансий, где человек значится автором.
 */

export class AccountDeletionError extends Error {}

export type DeleteAccountResult = "deleted" | "requested";

/** Договор заключён: действующие условия или клиент уже в статусе «активный». */
export async function isClientContracted(clientId: string): Promise<boolean> {
  const [agreement, client] = await Promise.all([
    getActiveAgreement(clientId),
    prisma.client.findFirst({ where: { id: clientId }, select: { status: true } }),
  ]);
  return Boolean(agreement) || client?.status === "ACTIVE";
}

/** Обезличить пользователя и закрыть ему вход. */
export async function anonymizeUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted-${userId}@deleted.invalid`,
      fullName: "Удалённый пользователь",
      phone: null,
      position: null,
      avatarUrl: null,
      telegramChatId: null,
      passwordHash: null,
      totpSecret: null,
      totpEnabledAt: null,
      grants: [],
      notifyPrefs: {},
      isActive: false,
      deletionRequestedAt: null,
      deletedAt: new Date(),
    },
  });
  // Коды восстановления и сбросы пароля без пользователя бессмысленны и не должны жить дольше него
  await prisma.recoveryCode.deleteMany({ where: { userId } });
  await prisma.passwordReset.deleteMany({ where: { userId } });
}

/**
 * Клиент удаляет свой аккаунт: сразу, если договора нет, иначе просит владельца.
 * Возвращает, что произошло, — интерфейс по-разному говорит об этом человеку.
 */
export async function deleteOwnAccount(actor: Actor): Promise<{ result: DeleteAccountResult; wasLastUser: boolean }> {
  if (!actor.clientId) throw new AccountDeletionError("Аккаунт сотрудника агентства удаляет владелец");

  if (await isClientContracted(actor.clientId)) {
    const user = await prisma.user.findFirst({
      where: { id: actor.id },
      select: { fullName: true, client: { select: { name: true } } },
    });
    await prisma.user.update({ where: { id: actor.id }, data: { deletionRequestedAt: new Date() } });

    const owners = await prisma.user.findMany({
      where: { organizationId: actor.organizationId, role: "OWNER", isActive: true },
      select: { id: true },
    });
    await notify({
      organizationId: actor.organizationId,
      userIds: owners.map((o) => o.id),
      event: "ACCOUNT_DELETION_REQUESTED",
      title: `Просьба удалить аккаунт: ${user?.fullName ?? "клиент"}`,
      body: `${user?.client?.name ?? "Клиент с договором"} — подтвердите или отклоните в карточке клиента.`,
      linkUrl: `/a/clients/${actor.clientId}`,
    });
    return { result: "requested", wasLastUser: false };
  }

  const others = await prisma.user.count({
    where: { clientId: actor.clientId, isActive: true, id: { not: actor.id } },
  });
  await anonymizeUser(actor.id);
  return { result: "deleted", wasLastUser: others === 0 };
}

/** Клиент передумал: снять свой запрос на удаление. */
export async function cancelDeletionRequest(actor: Actor): Promise<void> {
  await prisma.user.update({ where: { id: actor.id }, data: { deletionRequestedAt: null } });
}

/** Владелец подтверждает: аккаунт клиента обезличивается. */
export async function confirmAccountDeletion(actor: Actor, userId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId, clientId: { not: null } },
    select: { id: true, deletionRequestedAt: true },
  });
  if (!user) throw new AccountDeletionError("Пользователь не найден");
  if (!user.deletionRequestedAt) throw new AccountDeletionError("Запроса на удаление нет");
  await anonymizeUser(user.id);
}

/** Владелец отклоняет: аккаунт остаётся, человек получает уведомление. */
export async function rejectAccountDeletion(actor: Actor, userId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId, clientId: { not: null } },
    select: { id: true, deletionRequestedAt: true },
  });
  if (!user) throw new AccountDeletionError("Пользователь не найден");
  if (!user.deletionRequestedAt) throw new AccountDeletionError("Запроса на удаление нет");
  await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } });
  await notify({
    organizationId: actor.organizationId,
    userIds: [user.id],
    event: "ACCOUNT_DELETION_REJECTED",
    title: "Запрос на удаление аккаунта отклонён",
    body: "По вашему договору аккаунт пока нельзя удалить. Свяжитесь с менеджером, если нужно обсудить.",
    linkUrl: "/settings",
  });
}

/** Кто из пользователей клиента просит удалить аккаунт — для карточки клиента у агентства. */
export async function listDeletionRequests(clientId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { clientId, isActive: true, deletionRequestedAt: { not: null } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
