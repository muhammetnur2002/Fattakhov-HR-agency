/**
 * Быстрая регистрация и вход по номеру телефона.
 *
 * Сюда доходит уже проверенная личность; проверяется то, что решается
 * после: найти или завести, и не открыть по дороге дверь в чужое.
 *
 * - Без согласия никого не заводим — только отправляем регистрироваться.
 * - Заводится только администратор клиента, компания помечена как
 *   самостоятельная регистрация и ждёт анкеты.
 * - Ищем только по проверенному полю: вписанный себе в профиль чужой
 *   номер не открывает кабинет его владельцу — и наоборот.
 * - Второй фактор проверяется до погашения кода из SMS — и тем же
 *   счётчиком неверных кодов, что вход по паролю.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { maskPhone } from "@/lib/auth/phone";
import { totp } from "@/lib/auth/totp";
import { prismaRaw as db } from "@/lib/db/prisma";
import { REGISTRATION_CONSENT_VERSION } from "@/lib/legal/registration-consent";
import { anonymizeUser } from "@/lib/services/account-deletion";
import {
  NeedsRegistrationError,
  ProofAlreadyUsedError,
  resolveQuickSignIn,
  SecondFactorNeededError,
  SecondFactorWrongError,
  type QuickIdentity,
} from "@/lib/services/quick-registration";
import { enableTwoFactorForTest } from "./two-factor-fixtures";

const PHONE = "+79990000202";
const OTHER_EMAIL = "quick-other@fattakhov.hr";

const phone: QuickIdentity = { kind: "phone", phone: PHONE };

async function cleanup() {
  const users = await db.user.findMany({
    where: {
      OR: [
        { phoneVerified: PHONE },
        { email: OTHER_EMAIL },
        { email: { endsWith: "@users.invalid" }, phone: PHONE },
        // Обезличенные тестом удаления — их телефон уже стёрт
        { email: { endsWith: "@deleted.invalid" }, client: { name: { startsWith: "Новая компания (" } } },
      ],
    },
    select: { id: true, clientId: true },
  });
  const userIds = users.map((u) => u.id);
  // Только компании, заведённые регистрацией в этих тестах: «чужой
  // кабинет» ниже привязан к компании из seed, её трогать нельзя
  const clientIds = (
    await db.client.findMany({
      where: {
        id: { in: users.map((u) => u.clientId).filter((c): c is string => Boolean(c)) },
        selfRegisteredAt: { not: null },
      },
      select: { id: true },
    })
  ).map((c) => c.id);
  await db.authFailure.deleteMany({
    where: { OR: userIds.map((id) => ({ key: { endsWith: id } })) },
  });
  await db.recoveryCode.deleteMany({ where: { userId: { in: userIds } } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.lead.deleteMany({ where: { clientId: { in: clientIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.client.deleteMany({ where: { id: { in: clientIds } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("регистрация", () => {
  it("без согласия — никого не заводит, отправляет регистрироваться", async () => {
    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "" }),
    ).rejects.toThrow(NeedsRegistrationError);
    expect(await db.user.count({ where: { phoneVerified: PHONE } })).toBe(0);
  });

  it("с согласием заводит администратора клиента и компанию под анкету", async () => {
    const user = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });

    expect(user.role).toBe("CLIENT_ADMIN");
    expect(user.email).toBe("phone-79990000202@users.invalid");
    expect(user.fullName).toBe(maskPhone(PHONE));

    const saved = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { phoneVerified: true, passwordHash: true, client: true },
    });
    expect(saved.phoneVerified).toBe(PHONE);
    expect(saved.passwordHash).toBeNull();
    expect(saved.client?.selfRegisteredAt).not.toBeNull();
    expect(saved.client?.briefCompletedAt).toBeNull();
    expect(saved.client?.status).toBe("LEAD");
  });

  it("заявка агентству заводится сразу — с согласием этого момента и текста регистрации", async () => {
    const user = await resolveQuickSignIn(phone, {
      consent: true,
      secondFactorCode: "",
      meta: { ip: "203.0.113.7", userAgent: "test-agent" },
    });
    const lead = await db.lead.findFirstOrThrow({ where: { clientId: user.clientId } });
    expect(lead.consentAt).not.toBeNull();
    expect(lead.consentVersion).toBe(REGISTRATION_CONSENT_VERSION);
    expect(lead.ip).toBe("203.0.113.7");
    expect(lead.userAgent).toBe("test-agent");
    expect(lead.contact).toBe(PHONE);
    // Оповещения агентству пока нет: разбирать нечего до анкеты
    expect(
      await db.notification.count({
        where: { eventCode: "LEAD_RECEIVED", title: { contains: maskPhone(PHONE) } },
      }),
    ).toBe(0);
  });

  it("по телефону — номер проверенным и контактным, почта-заглушка", async () => {
    const user = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    const saved = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { phoneVerified: true, phone: true, email: true },
    });
    expect(saved.phoneVerified).toBe(PHONE);
    expect(saved.phone).toBe(PHONE);
    expect(saved.email).toBe("phone-79990000202@users.invalid");
  });
});

describe("вход", () => {
  it("второй раз — тот же человек, без второй компании", async () => {
    const first = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    const second = await resolveQuickSignIn(phone, { consent: false, secondFactorCode: "" });
    expect(second.id).toBe(first.id);
    expect(await db.user.count({ where: { phoneVerified: PHONE } })).toBe(1);
  });

  it("вписанный себе телефон — тоже не вход: ищем по подтверждённому", async () => {
    await db.user.create({
      data: {
        organizationId: "org_fattakhov",
        email: OTHER_EMAIL,
        fullName: "Чужой Кабинет",
        role: "CLIENT_ADMIN",
        clientId: "cl_starfish",
        phone: PHONE,
      },
    });

    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "" }),
    ).rejects.toThrow(NeedsRegistrationError);
  });

  it("удалённый аккаунт освобождает номер: зарегистрироваться им можно заново", async () => {
    const first = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    await anonymizeUser(first.id);

    const gone = await db.user.findUniqueOrThrow({
      where: { id: first.id },
      select: { phoneVerified: true },
    });
    expect(gone).toEqual({ phoneVerified: null });

    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "" }),
    ).rejects.toThrow(NeedsRegistrationError);
    const again = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    expect(again.id).not.toBe(first.id);
  });
});

describe("второй фактор", () => {
  async function withTwoFactor(): Promise<{ userId: string; secret: string }> {
    const user = await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    const { secret } = await enableTwoFactorForTest(user.id);
    return { userId: user.id, secret };
  }

  it("включён — без кода из приложения не пускает", async () => {
    await withTwoFactor();
    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "" }),
    ).rejects.toThrow(SecondFactorNeededError);
  });

  it("неверный код из приложения — отказ", async () => {
    await withTwoFactor();
    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "000000" }),
    ).rejects.toThrow(SecondFactorWrongError);
  });

  it("неверные коды считаются тем же счётчиком, что у входа по паролю", async () => {
    // Без общего счётчика вход по SMS позволял бы перебирать шесть цифр
    // кода из приложения сколько угодно
    const { secret } = await withTwoFactor();
    const wrong = totp(secret) === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(
        resolveQuickSignIn(phone, { consent: false, secondFactorCode: wrong }),
      ).rejects.toThrow(SecondFactorWrongError);
    }
    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: totp(secret) }),
    ).rejects.toThrow(SecondFactorWrongError);
  });

  it("тот же код из приложения второй раз не проходит", async () => {
    const { secret } = await withTwoFactor();
    const code = totp(secret);
    await resolveQuickSignIn(phone, { consent: false, secondFactorCode: code });
    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: code }),
    ).rejects.toThrow(SecondFactorWrongError);
  });

  it("код из SMS не гасится, пока не пройден второй фактор", async () => {
    const { secret } = await withTwoFactor();
    let consumed = 0;
    const beforeEnter = async () => {
      consumed++;
      return true;
    };

    await expect(
      resolveQuickSignIn(phone, { consent: false, secondFactorCode: "", beforeEnter }),
    ).rejects.toThrow(SecondFactorNeededError);
    expect(consumed).toBe(0);

    await resolveQuickSignIn(phone, {
      consent: false,
      secondFactorCode: totp(secret),
      beforeEnter,
    });
    expect(consumed).toBe(1);
  });

  it("код уже погашен параллельным входом — отказ", async () => {
    await resolveQuickSignIn(phone, { consent: true, secondFactorCode: "" });
    await expect(
      resolveQuickSignIn(phone, {
        consent: false,
        secondFactorCode: "",
        beforeEnter: async () => false,
      }),
    ).rejects.toThrow(ProofAlreadyUsedError);
  });
});
