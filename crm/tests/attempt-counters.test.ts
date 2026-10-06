/**
 * Счётчики попыток у шестизначных кодов — под одновременными запросами.
 *
 * Прежняя схема читала счётчик, проверяла код и только потом увеличивала:
 * двадцать запросов разом все видели «попыток 0» и все проверяли код.
 * Лимит в пять попыток при этом ничего не ограничивал. Теперь попытка
 * занимается одним условным UPDATE ещё до проверки, и под нагрузкой
 * проверок не больше лимита.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Считаем настоящие проверки кода (argon2) в регистрации
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/password")>();
  return { ...original, verifyPassword: vi.fn(original.verifyPassword) };
});

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { totp } from "@/lib/auth/totp";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { setSmsTransportForTests, type SmsMessage } from "@/lib/notifications/sms";
import { reserveSecondFactorAttempt } from "@/lib/security/login-throttle";
import { checkPhoneCode, requestPhoneCode } from "@/lib/services/phone-auth";
import { confirmCompanyRegistration, requestCompanyRegistration } from "@/lib/services/registration";
import { checkSecondFactor } from "@/lib/services/two-factor";

import { enableTwoFactorForTest } from "./two-factor-fixtures";

const PHONE = "+79990000404";
const MARK = "test-attempts";
const ORG = "org_fattakhov";
const PARALLEL = 20;
const LIMIT = 5;
/** Код из SMS выдерживает восемь проверок (lib/services/phone-auth.ts). */
const PHONE_LIMIT = 8;

let sent: SmsMessage[] = [];
const lastSmsCode = () => (sent.at(-1)?.text ?? "").match(/\d{6}/)?.[0] ?? "";

async function cleanup() {
  await db.phoneCode.deleteMany({ where: { phone: PHONE } });
  await db.pendingClientRegistration.deleteMany({ where: { email: { startsWith: MARK } } });
  const users = await db.user.findMany({
    where: { email: { startsWith: MARK } },
    select: { id: true, clientId: true },
  });
  const ids = users.map((u) => u.id);
  await db.authFailure.deleteMany({ where: { key: { contains: MARK } } });
  await db.authFailure.deleteMany({ where: { key: { in: ids.map((id) => `login:2fa:${id}`) } } });
  await db.activityLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  const clientIds = users.flatMap((u) => (u.clientId ? [u.clientId] : []));
  await db.lead.deleteMany({
    where: { OR: [{ clientId: { in: clientIds } }, { contact: { startsWith: MARK } }] },
  });
  await db.client.deleteMany({ where: { id: { in: clientIds } } });
}

beforeEach(async () => {
  await cleanup();
  sent = [];
  setSmsTransportForTests({ send: async (m) => void sent.push(m) });
  vi.mocked(verifyPassword).mockClear();
});

afterAll(async () => {
  await cleanup();
  setSmsTransportForTests(undefined);
  await db.$disconnect();
});

const fails = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
const messages = (results: PromiseSettledResult<unknown>[]) =>
  fails(results).map((r) => String(r.reason?.message ?? r.reason));

describe("код из SMS", () => {
  it("двадцать неверных разом: проверок ровно пять, остальным — «слишком много»", async () => {
    await requestPhoneCode(PHONE);
    const code = lastSmsCode();
    const wrong = code === "111111" ? "222222" : "111111";

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => checkPhoneCode(PHONE, wrong)),
    );

    const text = messages(results);
    expect(text.filter((m) => /Неверный код/.test(m))).toHaveLength(PHONE_LIMIT);
    expect(text.filter((m) => /Слишком много/.test(m))).toHaveLength(PARALLEL - PHONE_LIMIT);
    const row = await db.phoneCode.findFirstOrThrow({ where: { phone: PHONE } });
    expect(row.attempts).toBe(PHONE_LIMIT);
  });

  it("двадцать верных разом: успешных проверок не больше лимита", async () => {
    await requestPhoneCode(PHONE);
    const code = lastSmsCode();

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => checkPhoneCode(PHONE, code)),
    );

    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(PHONE_LIMIT);
  });

  it("девятнадцать неверных и один верный разом: верный проходит не чаще одного раза, всего попыток восемь", async () => {
    await requestPhoneCode(PHONE);
    const code = lastSmsCode();
    const wrong = code === "111111" ? "222222" : "111111";

    const results = await Promise.allSettled([
      checkPhoneCode(PHONE, code),
      ...Array.from({ length: PARALLEL - 1 }, () => checkPhoneCode(PHONE, wrong)),
    ]);

    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
    const row = await db.phoneCode.findFirstOrThrow({ where: { phone: PHONE } });
    expect(row.attempts).toBeLessThanOrEqual(PHONE_LIMIT);
  });
});

describe("код подтверждения регистрации", () => {
  async function pending(): Promise<{ email: string; code: string }> {
    const email = `${MARK}+${Math.random().toString(36).slice(2, 8)}@example.com`;
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await requestCompanyRegistration({
        email,
        phone: "+79001112233",
        password: "kofe-s-molokom-v-pyatnitsu",
        ip: "203.0.113.9",
      });
      const code = send.mock.calls.at(-1)?.[0].text.match(/\b\d{6}\b/)?.[0] ?? "";
      return { email, code };
    } finally {
      send.mockRestore();
    }
  }

  it("двадцать неверных разом: код сверяется не больше пяти раз", async () => {
    const { email, code } = await pending();
    const wrong = code === "111111" ? "222222" : "111111";
    vi.mocked(verifyPassword).mockClear();

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => confirmCompanyRegistration({ email, code: wrong })),
    );

    expect(vi.mocked(verifyPassword).mock.calls.length).toBeLessThanOrEqual(LIMIT);
    expect(messages(results).filter((m) => /Код не подошёл/.test(m))).toHaveLength(LIMIT);
    const row = await db.pendingClientRegistration.findFirstOrThrow({ where: { email } });
    expect(row.attempts).toBeLessThanOrEqual(LIMIT);
  });

  it("верный код разом из двадцати запросов заводит одного пользователя", async () => {
    const { email, code } = await pending();

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => confirmCompanyRegistration({ email, code })),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
});

describe("код второго фактора", () => {
  async function userWithTwoFactor() {
    const user = await db.user.create({
      data: {
        organizationId: ORG,
        email: `${MARK}-2fa@example.com`,
        fullName: "Тест Счётчики",
        role: "RECRUITER",
        passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
      },
      select: { id: true },
    });
    const { secret } = await enableTwoFactorForTest(user.id);
    return { userId: user.id, secret };
  }

  it("двадцать неверных разом: «неверно» пять раз, остальным отказано без проверки", async () => {
    const { userId, secret } = await userWithTwoFactor();
    const wrong = totp(secret) === "000000" ? "111111" : "000000";

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => checkSecondFactor(userId, wrong)),
    );

    expect(results.filter((r) => r === "wrong")).toHaveLength(LIMIT);
    expect(results.filter((r) => r === "blocked")).toHaveLength(PARALLEL - LIMIT);
    expect(results.filter((r) => r === "ok")).toHaveLength(0);
  });

  it("верный код разом из двадцати запросов пропускает одного", async () => {
    const { userId, secret } = await userWithTwoFactor();
    const code = totp(secret);

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => checkSecondFactor(userId, code)),
    );

    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });

  it("занять попытку можно ровно лимит раз, сколько бы запросов ни пришло", async () => {
    const taken = await Promise.all(
      Array.from({ length: PARALLEL }, () => reserveSecondFactorAttempt(`${MARK}-reserve`)),
    );
    expect(taken.filter(Boolean)).toHaveLength(LIMIT);
  });
});
