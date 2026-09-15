/**
 * Двухфакторная аутентификация.
 *
 * Главное, что здесь проверяется, — не «работает ли код из приложения»,
 * а то, что человек не может запереть себя снаружи: коды восстановления
 * выдаются, работают, гасятся после использования и перевыпускаются.
 * Система с персональными данными, из которой владелец не может войти,
 * хуже системы без второго фактора.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { totp } from "@/lib/auth/totp";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  confirmTwoFactor,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  requiresSecondFactor,
  startTwoFactorSetup,
  TwoFactorError,
  verifySecondFactor,
} from "@/lib/services/two-factor";

const EMAIL = "totp-test@fattakhov.hr";
const ORG = "org_fattakhov";
const PASSWORD = "parol-dlya-testa-2026";

let userId = "";

async function cleanup() {
  const user = await db.user.findFirst({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (user) {
    await db.recoveryCode.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

beforeEach(async () => {
  await cleanup();
  const user = await db.user.create({
    data: {
      organizationId: ORG,
      email: EMAIL,
      fullName: "Тестовый Фактор",
      role: "OWNER",
      passwordHash: await hashPassword(PASSWORD),
    },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/** Проходит подключение целиком и отдаёт секрет с кодами восстановления. */
async function enable(): Promise<{ secret: string; codes: string[] }> {
  const setup = await startTwoFactorSetup({ userId, issuer: "Fattakhov HR" });
  const codes = await confirmTwoFactor({
    userId,
    code: totp(setup.secret),
  });
  return { secret: setup.secret, codes };
}

describe("подключение", () => {
  it("до подтверждения второй фактор не требуется", async () => {
    await startTwoFactorSetup({ userId, issuer: "Fattakhov HR" });

    // Человек, закрывший вкладку на середине, не должен оказаться заперт
    expect(await requiresSecondFactor(userId)).toBe(false);
    expect((await getTwoFactorStatus(userId)).enabled).toBe(false);
  });

  it("подтверждается кодом из приложения и выдаёт коды восстановления", async () => {
    const { codes } = await enable();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    // Формат рассчитан на переписывание от руки
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const status = await getTwoFactorStatus(userId);
    expect(status.enabled).toBe(true);
    expect(status.recoveryCodesLeft).toBe(10);
    expect(await requiresSecondFactor(userId)).toBe(true);
  });

  it("неверный код не включает и не выдаёт коды", async () => {
    await startTwoFactorSetup({ userId, issuer: "Fattakhov HR" });

    await expect(
      confirmTwoFactor({ userId, code: "000000" }),
    ).rejects.toThrow(TwoFactorError);

    expect(await requiresSecondFactor(userId)).toBe(false);
    expect(await db.recoveryCode.count({ where: { userId } })).toBe(0);
  });

  it("подтвердить, не начав, нельзя", async () => {
    await expect(
      confirmTwoFactor({ userId, code: "123456" }),
    ).rejects.toThrow(/не начато/);
  });

  it("включить дважды нельзя", async () => {
    await enable();
    await expect(
      startTwoFactorSetup({ userId, issuer: "Fattakhov HR" }),
    ).rejects.toThrow(/уже включена/);
  });

  it("коды восстановления в базе лежат хешами", async () => {
    const { codes } = await enable();

    const stored = await db.recoveryCode.findMany({
      where: { userId },
      select: { codeHash: true },
    });

    // Утечка базы не должна давать возможности войти
    for (const record of stored) {
      expect(codes).not.toContain(record.codeHash);
      expect(record.codeHash.startsWith("$argon2")).toBe(true);
    }
  });
});

describe("вход со вторым фактором", () => {
  it("принимает код из приложения", async () => {
    const { secret } = await enable();
    expect(await verifySecondFactor({ userId, code: totp(secret) })).toBe(true);
  });

  it("не принимает чужой или устаревший код", async () => {
    await enable();
    expect(await verifySecondFactor({ userId, code: "000000" })).toBe(false);
    expect(await verifySecondFactor({ userId, code: "" })).toBe(false);
  });

  it("принимает код восстановления и гасит его", async () => {
    const { codes } = await enable();
    const code = codes[0];

    expect(await verifySecondFactor({ userId, code })).toBe(true);
    // Второй раз тот же код не подходит
    expect(await verifySecondFactor({ userId, code })).toBe(false);

    expect((await getTwoFactorStatus(userId)).recoveryCodesLeft).toBe(9);
  });

  it("код восстановления принимается в любом регистре", async () => {
    const { codes } = await enable();
    expect(
      await verifySecondFactor({ userId, code: codes[0].toLowerCase() }),
    ).toBe(true);
  });

  it("остальные коды восстановления продолжают работать", async () => {
    const { codes } = await enable();
    await verifySecondFactor({ userId, code: codes[0] });

    expect(await verifySecondFactor({ userId, code: codes[1] })).toBe(true);
    expect(await verifySecondFactor({ userId, code: codes[2] })).toBe(true);
    expect((await getTwoFactorStatus(userId)).recoveryCodesLeft).toBe(7);
  });

  it("отключённому пользователю ничего не подходит", async () => {
    const { secret } = await enable();
    await db.user.update({ where: { id: userId }, data: { isActive: false } });

    expect(await verifySecondFactor({ userId, code: totp(secret) })).toBe(false);
  });
});

describe("перевыпуск и отключение", () => {
  it("перевыпуск обесценивает прежние коды", async () => {
    const { codes: old } = await enable();
    const fresh = await regenerateRecoveryCodes({ userId, password: PASSWORD });

    expect(fresh).toHaveLength(10);
    expect(await verifySecondFactor({ userId, code: old[0] })).toBe(false);
    expect(await verifySecondFactor({ userId, code: fresh[0] })).toBe(true);
  });

  it("перевыпуск без пароля невозможен", async () => {
    await enable();
    await expect(
      regenerateRecoveryCodes({ userId, password: "не тот пароль" }),
    ).rejects.toThrow(/Пароль неверен/);
  });

  it("отключение требует пароля", async () => {
    await enable();

    // Иначе доступ к открытой вкладке снимает второй фактор,
    // ради которого его и включали
    await expect(
      disableTwoFactor({ userId, password: "не тот пароль" }),
    ).rejects.toThrow(/Пароль неверен/);

    expect(await requiresSecondFactor(userId)).toBe(true);
  });

  it("отключение снимает фактор и стирает коды", async () => {
    await enable();
    await disableTwoFactor({ userId, password: PASSWORD });

    expect(await requiresSecondFactor(userId)).toBe(false);
    expect(await db.recoveryCode.count({ where: { userId } })).toBe(0);

    const user = await db.user.findFirstOrThrow({
      where: { id: userId },
      select: { totpSecret: true },
    });
    // Секрет тоже стираем: иначе повторное включение молча вернёт старый
    expect(user.totpSecret).toBeNull();
  });
});
