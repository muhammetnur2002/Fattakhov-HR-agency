/**
 * Смена и восстановление пароля.
 *
 * Цена ошибки здесь выше обычной: с одной стороны доступ к системе
 * с персональными данными, с другой - запертый владелец, которому
 * восстановить доступ некому.
 *
 * Проверяется не только «сработало», но и то, что форма восстановления
 * не превращается в способ узнать, кто работает в компании.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  changePassword,
  getResetTarget,
  PasswordError,
  requestPasswordReset,
  resetPassword,
} from "@/lib/services/passwords";
import { acceptInviteSchema } from "@/lib/validation/auth";
import { newPasswordSchema } from "@/lib/validation/password";

const EMAIL = "password-test@fattakhov.hr";
const ORG = "org_fattakhov";
const OLD = "staryy-parol-2026";
const NEW = "sovsem-drugoy-parol-2026";

let userId = "";

async function cleanup() {
  const user = await db.user.findFirst({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (user) {
    await db.passwordReset.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

beforeEach(async () => {
  await cleanup();
  const user = await db.user.create({
    data: {
      organizationId: ORG,
      email: EMAIL,
      fullName: "Тестовый Пароль",
      role: "RECRUITER",
      passwordHash: await hashPassword(OLD),
    },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("требования к паролю", () => {
  it("короткий не проходит", () => {
    expect(newPasswordSchema.safeParse("korotkiy1").success).toBe(false);
  });

  it("очевидный не проходит даже при достаточной длине", () => {
    expect(newPasswordSchema.safeParse("1234567890").success).toBe(false);
    expect(newPasswordSchema.safeParse("qwerty123").success).toBe(false);
  });

  it("однообразный не проходит", () => {
    expect(newPasswordSchema.safeParse("aaaaaaaaaaaa").success).toBe(false);
  });

  it("длинная фраза проходит без спецсимволов и цифр", () => {
    // Правило про заглавные и спецсимволы даёт Parol123! у половины
    // сотрудников. Длина надёжнее и запоминается
    expect(newPasswordSchema.safeParse("зелёный чайник на подоконнике").success).toBe(true);
  });

  /*
    Приглашение — единственное место, где пароль задаётся впервые,
    и требования там были свои, слабее: восемь символов без проверки
    на очевидность. Получалось наоборот к смыслу: «password»,
    «12345678» и «qwerty12» принимались при заведении учётки
    и отвергались при смене того же пароля.

    Тест сверяет два пути на одних и тех же значениях, а не проверяет
    каждый по отдельности: именно расхождение и было ошибкой.
  */
  it("приглашение требует того же, что смена и сброс", () => {
    const проверить = (password: string) => ({
      приглашение: acceptInviteSchema.safeParse({
        fullName: "Иван Иванов",
        password,
        passwordConfirm: password,
      }).success,
      смена: newPasswordSchema.safeParse(password).success,
    });

    for (const password of [
      "password",
      "12345678",
      "qwerty12",
      "aaaaaaaa",
      "зелёный чайник на подоконнике",
      "длинный и разнообразный пароль",
    ]) {
      const { приглашение, смена } = проверить(password);
      expect(приглашение, password).toBe(смена);
    }
  });

  it("слабый пароль не заводит учётку через приглашение", () => {
    // Отдельно от сверки выше: та прошла бы и в случае, если оба пути
    // одинаково ослабли
    for (const password of ["password", "12345678", "qwerty12"]) {
      expect(
        acceptInviteSchema.safeParse({
          fullName: "Иван Иванов",
          password,
          passwordConfirm: password,
        }).success,
        password,
      ).toBe(false);
    }
  });
});

describe("смена пароля вошедшим", () => {
  it("меняет пароль и отмечает время смены", async () => {
    await changePassword({
      userId,
      currentPassword: OLD,
      newPassword: NEW,
    });

    const user = await db.user.findFirstOrThrow({
      where: { id: userId },
      select: { passwordHash: true, passwordChangedAt: true },
    });

    expect(await verifyPassword(user.passwordHash!, NEW)).toBe(true);
    expect(await verifyPassword(user.passwordHash!, OLD)).toBe(false);
    // Отметка гасит сессии, выпущенные раньше
    expect(user.passwordChangedAt).not.toBeNull();
  });

  it("без верного текущего пароля не меняет", async () => {
    await expect(
      changePassword({
        userId,
        currentPassword: "не тот пароль совсем",
        newPassword: NEW,
      }),
    ).rejects.toThrow(PasswordError);

    const user = await db.user.findFirstOrThrow({
      where: { id: userId },
      select: { passwordHash: true, passwordChangedAt: true },
    });
    expect(await verifyPassword(user.passwordHash!, OLD)).toBe(true);
    expect(user.passwordChangedAt).toBeNull();
  });

  it("не даёт поставить тот же пароль", async () => {
    await expect(
      changePassword({ userId, currentPassword: OLD, newPassword: OLD }),
    ).rejects.toThrow(/совпадает/);
  });

  it("отключённому пользователю пароль не сменить", async () => {
    await db.user.update({ where: { id: userId }, data: { isActive: false } });

    await expect(
      changePassword({ userId, currentPassword: OLD, newPassword: NEW }),
    ).rejects.toThrow(PasswordError);
  });
});

describe("восстановление по ссылке", () => {
  /**
   * Достаёт токен из письма, которое ушло в лог.
   *
   * Ссылка нигде больше не доступна: в базе лежит только хеш, и это
   * намеренно. Значит и тест обязан ходить тем же путём, что человек,
   * то есть через письмо.
   */
  async function requestAndCaptureToken(email = EMAIL): Promise<string | null> {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await requestPasswordReset({ email, ip: "203.0.113.9" });
    const output = spy.mock.calls.flat().join("\n");
    spy.mockRestore();

    const match = output.match(/\/reset\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? null;
  }

  it("выдаёт рабочую ссылку и меняет по ней пароль", async () => {
    const token = await requestAndCaptureToken();
    expect(token).toBeTruthy();

    const target = await getResetTarget(token!);
    expect(target?.email).toBe(EMAIL);

    await resetPassword({ token: token!, newPassword: NEW });

    const user = await db.user.findFirstOrThrow({
      where: { id: userId },
      select: { passwordHash: true, passwordChangedAt: true },
    });
    expect(await verifyPassword(user.passwordHash!, NEW)).toBe(true);
    expect(user.passwordChangedAt).not.toBeNull();
  });

  it("ссылка одноразовая", async () => {
    const token = await requestAndCaptureToken();
    await resetPassword({ token: token!, newPassword: NEW });

    // Второй раз по той же ссылке зайти нельзя
    expect(await getResetTarget(token!)).toBeNull();
    await expect(
      resetPassword({ token: token!, newPassword: "ещё один пароль 2026" }),
    ).rejects.toThrow(PasswordError);
  });

  it("новый запрос гасит прежнюю ссылку", async () => {
    const first = await requestAndCaptureToken();
    const second = await requestAndCaptureToken();

    expect(first).not.toBe(second);
    // Иначе у человека на руках несколько рабочих ссылок и отозвать их нечем
    expect(await getResetTarget(first!)).toBeNull();
    expect(await getResetTarget(second!)).not.toBeNull();
  });

  it("истёкшая ссылка не работает", async () => {
    const token = await requestAndCaptureToken();

    await db.passwordReset.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getResetTarget(token!)).toBeNull();
  });

  it("отключённому пользователю ссылка не годится", async () => {
    const token = await requestAndCaptureToken();
    await db.user.update({ where: { id: userId }, data: { isActive: false } });

    expect(await getResetTarget(token!)).toBeNull();
  });

  it("несуществующий адрес не отличить от существующего", async () => {
    // Ни исключения, ни разницы в поведении: иначе форма превращается
    // в способ проверить, работает ли человек в компании
    await expect(
      requestPasswordReset({ email: "нет-такого@example.com" }),
    ).resolves.toBeUndefined();

    const created = await db.passwordReset.count();
    expect(created).toBe(0);
  });

  it("токен в базе хранится хешем, а не как есть", async () => {
    const token = await requestAndCaptureToken();

    const record = await db.passwordReset.findFirstOrThrow({
      where: { userId },
      select: { tokenHash: true, requestedIp: true },
    });

    // Утечка базы не должна давать возможности войти
    expect(record.tokenHash).not.toBe(token);
    expect(record.tokenHash).toHaveLength(64);
    expect(record.requestedIp).toBe("203.0.113.9");
  });
});
