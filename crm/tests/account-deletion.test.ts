/**
 * Удаление аккаунта клиента (lib/services/account-deletion.ts).
 *
 * Без договора — сразу и насовсем (обезличивание), с договором — только запрос,
 * который подтверждает владелец. Важнее всего два свойства: аккаунт с договором не
 * исчезает без владельца, а после удаления в записи не остаётся персональных данных.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  AccountDeletionError,
  cancelDeletionRequest,
  confirmAccountDeletion,
  deleteOwnAccount,
  isClientContracted,
  rejectAccountDeletion,
} from "@/lib/services/account-deletion";

const ORG = "org_fattakhov";
const FREE = "test_del_free_client";
const PAID = "test_del_paid_client";
const U_FREE = "test_del_free_user";
const U_FREE2 = "test_del_free_user2";
const U_PAID = "test_del_paid_user";
const OWNER = "usr_owner";

const owner: Actor = { id: OWNER, organizationId: ORG, role: "OWNER", clientId: null, grants: [] };
const clientActor = (id: string, clientId: string): Actor => ({
  id,
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId,
  grants: [],
});

async function cleanup() {
  await db.notification.deleteMany({ where: { title: { contains: "test_del" } } });
  await db.notification.deleteMany({ where: { userId: { in: [U_PAID, U_FREE, U_FREE2] } } });
  await db.agreement.deleteMany({ where: { clientId: PAID } });
  await db.user.deleteMany({ where: { id: { in: [U_FREE, U_FREE2, U_PAID] } } });
  await db.client.deleteMany({ where: { id: { in: [FREE, PAID] } } });
}

beforeEach(async () => {
  await cleanup();
  await db.client.createMany({
    data: [
      { id: FREE, organizationId: ORG, name: "test_del без договора", status: "LEAD" },
      { id: PAID, organizationId: ORG, name: "test_del с договором", status: "ACTIVE" },
    ],
  });
  await db.user.createMany({
    data: [
      { id: U_FREE, organizationId: ORG, email: "free1@test-del.example", fullName: "Свободный Один", role: "CLIENT_ADMIN", clientId: FREE, phone: "+7 900 000-00-01", vkUserId: "400500600" },
      { id: U_FREE2, organizationId: ORG, email: "free2@test-del.example", fullName: "Свободный Два", role: "CLIENT_HIRING", clientId: FREE },
      { id: U_PAID, organizationId: ORG, email: "paid@test-del.example", fullName: "Платный Клиент", role: "CLIENT_ADMIN", clientId: PAID },
    ],
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("клиент без договора", () => {
  it("удаляет аккаунт сразу, персональные данные стираются", async () => {
    const outcome = await deleteOwnAccount(clientActor(U_FREE, FREE));
    expect(outcome.result).toBe("deleted");

    const row = await db.user.findUnique({ where: { id: U_FREE } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.isActive).toBe(false);
    expect(row?.email).not.toContain("free1");
    expect(row?.fullName).toBe("Удалённый пользователь");
    expect(row?.phone).toBeNull();
    expect(row?.passwordHash).toBeNull();
    // Мессенджер — тоже ПДн: страница ВКонтакте
    expect(row?.vkUserId).toBeNull();
  });

  it("пуш-подписки его устройств удаляются, коллег — нет", async () => {
    // Строка пользователя обезличивается, а не удаляется: каскад по ключу
    // не сработает, подписки обязан убрать сам anonymizeUser
    const subscription = (n: string, userId: string) => ({
      userId,
      endpoint: `https://fcm.googleapis.com/fcm/send/test-del-${n}`,
      p256dh: "B".repeat(87),
      auth: "A".repeat(22),
    });
    await db.pushSubscription.createMany({
      data: [
        subscription("phone", U_FREE),
        subscription("laptop", U_FREE),
        subscription("colleague", U_FREE2),
      ],
    });

    await deleteOwnAccount(clientActor(U_FREE, FREE));

    expect(await db.pushSubscription.count({ where: { userId: U_FREE } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId: U_FREE2 } })).toBe(1);
  });

  it("если он последний в компании, это отмечено; иначе нет", async () => {
    const first = await deleteOwnAccount(clientActor(U_FREE, FREE));
    expect(first.wasLastUser).toBe(false);
    const second = await deleteOwnAccount(clientActor(U_FREE2, FREE));
    expect(second.wasLastUser).toBe(true);
  });

  it("договора нет — это видно по компании", async () => {
    expect(await isClientContracted(FREE)).toBe(false);
    expect(await isClientContracted(PAID)).toBe(true);
  });
});

describe("клиент с договором", () => {
  it("аккаунт не удаляется, а уходит запрос владельцу", async () => {
    const outcome = await deleteOwnAccount(clientActor(U_PAID, PAID));
    expect(outcome.result).toBe("requested");

    const row = await db.user.findUnique({ where: { id: U_PAID } });
    expect(row?.deletedAt).toBeNull();
    expect(row?.isActive).toBe(true);
    expect(row?.deletionRequestedAt).not.toBeNull();

    const notified = await db.notification.findMany({
      where: { userId: OWNER, eventCode: "ACCOUNT_DELETION_REQUESTED" },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { title: true },
    });
    expect(notified[0]?.title).toContain("Платный Клиент");
  });

  it("владелец подтверждает — аккаунт обезличен", async () => {
    await deleteOwnAccount(clientActor(U_PAID, PAID));
    await confirmAccountDeletion(owner, U_PAID);
    const row = await db.user.findUnique({ where: { id: U_PAID } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.email).not.toContain("paid@");
    expect(row?.deletionRequestedAt).toBeNull();
  });

  it("владелец отклоняет — аккаунт остаётся, клиент уведомлён", async () => {
    await deleteOwnAccount(clientActor(U_PAID, PAID));
    await rejectAccountDeletion(owner, U_PAID);
    const row = await db.user.findUnique({ where: { id: U_PAID } });
    expect(row?.deletedAt).toBeNull();
    expect(row?.deletionRequestedAt).toBeNull();
    const notified = await db.notification.count({ where: { userId: U_PAID, eventCode: "ACCOUNT_DELETION_REJECTED" } });
    expect(notified).toBe(1);
  });

  it("клиент может снять свой запрос", async () => {
    await deleteOwnAccount(clientActor(U_PAID, PAID));
    await cancelDeletionRequest(clientActor(U_PAID, PAID));
    const row = await db.user.findUnique({ where: { id: U_PAID } });
    expect(row?.deletionRequestedAt).toBeNull();
  });

  it("без запроса подтверждать нечего", async () => {
    await expect(confirmAccountDeletion(owner, U_PAID)).rejects.toThrow(AccountDeletionError);
    await expect(rejectAccountDeletion(owner, U_PAID)).rejects.toThrow(AccountDeletionError);
  });

  it("сотрудник агентства через этот путь удалить себя не может", async () => {
    await expect(deleteOwnAccount({ ...owner })).rejects.toThrow(AccountDeletionError);
  });
});
