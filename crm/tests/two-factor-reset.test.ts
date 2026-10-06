/**
 * «Сбросить 2FA» сотруднику — для потерявшего и телефон, и коды.
 *
 * Снятие второго фактора с чужой учётки — самое опасное действие вокруг
 * 2FA, поэтому проверяется не только «сработало», но и кто его не может:
 * не владелец, сам себе, чужая организация, клиент.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import { twoFactorGate, TwoFactorError, resetStaffTwoFactor, getTwoFactorStatus } from "@/lib/services/two-factor";

import { enableTwoFactorForTest } from "./two-factor-fixtures";

const MARK = "test-2fa-reset";
const ORG = "org_fattakhov";

async function makeUser(role: "OWNER" | "HEAD" | "RECRUITER" | "CLIENT_ADMIN", extra: { org?: string; clientId?: string } = {}) {
  return db.user.create({
    data: {
      organizationId: extra.org ?? ORG,
      email: `${MARK}-${role.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName: "Тест Сброс",
      role,
      clientId: extra.clientId,
      passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
    },
    select: { id: true, email: true },
  });
}

const asActor = (user: { id: string }, role: Actor["role"], org = ORG): Actor => ({
  id: user.id,
  organizationId: org,
  role,
  clientId: null,
});

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.authFailure.deleteMany({
    where: { OR: ids.flatMap((id) => [{ key: `login:2fa:${id}` }, { key: `login:2fa-setup-proof:${id}` }]) },
  });
  await db.authEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function withTwoFactor(role: "RECRUITER" | "HEAD") {
  const user = await makeUser(role);
  await enableTwoFactorForTest(user.id);
  await db.recoveryCode.create({ data: { userId: user.id, codeHash: "hash" } });
  return user;
}

describe("сброс владельцем", () => {
  it("стирает секрет, фактор, шаг и коды; ворота снова закрывают сотрудника", async () => {
    const owner = await makeUser("OWNER");
    const staff = await withTwoFactor("RECRUITER");
    await db.user.update({ where: { id: staff.id }, data: { totpLastStep: 123 } });

    await resetStaffTwoFactor(asActor(owner, "OWNER"), staff.id);

    const row = await db.user.findUniqueOrThrow({
      where: { id: staff.id },
      select: { role: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true },
    });
    expect(row.totpSecret).toBeNull();
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpLastStep).toBeNull();
    expect(await db.recoveryCode.count({ where: { userId: staff.id } })).toBe(0);
    // Тот же ворот, что у всех: на настройку заново
    expect(twoFactorGate(row)).toBe("setup");
    expect((await getTwoFactorStatus(staff.id)).enabled).toBe(false);
  });

  it("гасит открытые сессии сотрудника: отметка смены пароля обновляется", async () => {
    const owner = await makeUser("OWNER");
    const staff = await withTwoFactor("RECRUITER");
    const before = Date.now();

    await resetStaffTwoFactor(asActor(owner, "OWNER"), staff.id);

    const row = await db.user.findUniqueOrThrow({ where: { id: staff.id }, select: { passwordChangedAt: true } });
    expect(row.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("пишет событие TWO_FACTOR_RESET с тем, кто сбросил", async () => {
    const owner = await makeUser("OWNER");
    const staff = await withTwoFactor("HEAD");

    await resetStaffTwoFactor(asActor(owner, "OWNER"), staff.id);

    const event = await db.authEvent.findFirstOrThrow({ where: { userId: staff.id, kind: "TWO_FACTOR_RESET" } });
    expect(event.details).toMatchObject({ by: owner.id });
    expect(event.organizationId).toBe(ORG);
    expect(JSON.stringify(event)).not.toContain(staff.email);
  });

  it("сбрасывает и счётчики попыток кода: сотрудник после сброса не упрётся в старую блокировку", async () => {
    const owner = await makeUser("OWNER");
    const staff = await withTwoFactor("RECRUITER");
    await db.authFailure.createMany({
      data: Array.from({ length: 5 }, () => ({ key: `login:2fa:${staff.id}` })),
    });

    await resetStaffTwoFactor(asActor(owner, "OWNER"), staff.id);

    expect(await db.authFailure.count({ where: { key: `login:2fa:${staff.id}` } })).toBe(0);
  });
});

describe("кто не может", () => {
  it("себе — нельзя: нужен другой владелец", async () => {
    const owner = await makeUser("OWNER");
    await enableTwoFactorForTest(owner.id);

    await expect(resetStaffTwoFactor(asActor(owner, "OWNER"), owner.id)).rejects.toThrow(TwoFactorError);
    expect((await getTwoFactorStatus(owner.id)).enabled).toBe(true);
  });

  it("не владелец — нельзя, даже с доступом к управлению командой", async () => {
    const head = await makeUser("HEAD");
    const staff = await withTwoFactor("RECRUITER");
    const actor: Actor = { ...asActor(head, "HEAD"), grants: ["staff.manage"] };

    await expect(resetStaffTwoFactor(actor, staff.id)).rejects.toThrow(/Доступ запрещён/);
    expect((await getTwoFactorStatus(staff.id)).enabled).toBe(true);
  });

  it("чужая организация — не найден, ничего не тронуто", async () => {
    const owner = await makeUser("OWNER");
    const other = await db.organization.create({ data: { name: `${MARK} Чужая`, inn: "1650000998" } });
    const stranger = await makeUser("RECRUITER", { org: other.id });
    await enableTwoFactorForTest(stranger.id);

    await expect(resetStaffTwoFactor(asActor(owner, "OWNER"), stranger.id)).rejects.toThrow(/не найден/);
    expect((await getTwoFactorStatus(stranger.id)).enabled).toBe(true);

    await db.user.delete({ where: { id: stranger.id } });
    await db.organization.delete({ where: { id: other.id } });
  });

  it("пользователю клиента этим действием не сбросить — только сотрудникам агентства", async () => {
    const owner = await makeUser("OWNER");
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    const customer = await makeUser("CLIENT_ADMIN", { clientId: client.id });
    await enableTwoFactorForTest(customer.id);

    await expect(resetStaffTwoFactor(asActor(owner, "OWNER"), customer.id)).rejects.toThrow(/не найден/);
    expect((await getTwoFactorStatus(customer.id)).enabled).toBe(true);
  });
});
