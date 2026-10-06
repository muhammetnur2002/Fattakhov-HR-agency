/**
 * Обязательная двухфакторная для сотрудников агентства.
 *
 * Проверяется то, на чём держится правило: агентству без 2FA кабинет
 * не открывается (ворота в lib/auth/session.ts), и обхода по окружению
 * нет — ни в разработке, ни в проде; включить фактор нельзя без пароля
 * (иначе украденная сессия запирает владельца); у агентства фактор
 * не отключается; а в проде без ключа шифрования секрет открытым
 * текстом не сохраняется вовсе.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { generateSecret, totp } from "@/lib/auth/totp";
import { sealTotpSecret } from "@/lib/auth/totp-secret";
import { prismaRaw as db } from "@/lib/db/prisma";
import { setSmsTransportForTests, type SmsMessage } from "@/lib/notifications/sms";
import { requestPhoneCode } from "@/lib/services/phone-auth";
import {
  confirmTwoFactor,
  disableTwoFactor,
  getTwoFactorStatus,
  startTwoFactorSetup,
  TwoFactorError,
  twoFactorGate,
} from "@/lib/services/two-factor";

import { enableTwoFactorForTest } from "./two-factor-fixtures";

const MARK = "test-2fa-required";
const ORG = "org_fattakhov";
const PASSWORD = "kofe-s-molokom-v-pyatnitsu";
const PHONE = "+79990000505";

type Role = "OWNER" | "HEAD" | "RECRUITER" | "ACCOUNT" | "CLIENT_ADMIN" | "CLIENT_HIRING" | "CLIENT_VIEWER";

async function makeUser(
  role: Role,
  extra: { passwordless?: boolean; phoneVerified?: string; clientId?: string } = {},
) {
  return db.user.create({
    data: {
      organizationId: ORG,
      email: `${MARK}-${role.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName: "Тест Обязательная",
      role,
      clientId: extra.clientId,
      phoneVerified: extra.phoneVerified,
      passwordHash: extra.passwordless ? null : await hashPassword(PASSWORD),
    },
    select: { id: true, email: true },
  });
}

async function cleanup() {
  await db.phoneCode.deleteMany({ where: { phone: PHONE } });
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.authFailure.deleteMany({
    where: {
      OR: ids.flatMap((id) => [
        { key: `login:2fa-setup-proof:${id}` },
        { key: `login:2fa-setup-confirm:${id}` },
        { key: `login:2fa:${id}` },
      ]),
    },
  });
  await db.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await db.authEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

let sent: SmsMessage[] = [];

beforeEach(async () => {
  await cleanup();
  sent = [];
  setSmsTransportForTests({ send: async (m) => void sent.push(m) });
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await cleanup();
  setSmsTransportForTests(undefined);
  await db.$disconnect();
});

describe("ворота: кому нужна настройка", () => {
  const agency: Role[] = ["OWNER", "HEAD", "RECRUITER", "ACCOUNT"];
  const clients: Role[] = ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"];

  it("каждой роли агентства без включённой 2FA — на настройку", () => {
    for (const role of agency) {
      expect(twoFactorGate({ role, totpEnabledAt: null }), role).toBe("setup");
      expect(twoFactorGate({ role, totpEnabledAt: new Date() }), role).toBe("ok");
    }
  });

  it("клиентов не трогаем", () => {
    for (const role of clients) {
      expect(twoFactorGate({ role, totpEnabledAt: null }), role).toBe("ok");
    }
  });

  it("обхода по окружению нет: в разработке, тесте и проде ворота те же", () => {
    for (const env of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(twoFactorGate({ role: "OWNER", totpEnabledAt: null }), env).toBe("setup");
    }
  });

  it("начатая, но не подтверждённая настройка двери не открывает", async () => {
    const user = await makeUser("RECRUITER");
    await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { role: true, totpEnabledAt: true, totpSecret: true },
    });
    expect(row.totpSecret).not.toBeNull();
    expect(twoFactorGate(row)).toBe("setup");
  });
});

describe("включение требует подтверждения личности", () => {
  it("без пароля и с чужим паролем секрет не выдаётся и не сохраняется", async () => {
    const user = await makeUser("OWNER");
    await expect(startTwoFactorSetup({ userId: user.id, issuer: "X" })).rejects.toThrow(/парол/i);
    await expect(
      startTwoFactorSetup({ userId: user.id, issuer: "X", password: "не-тот-пароль-совсем" }),
    ).rejects.toThrow(TwoFactorError);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
    expect(row.totpSecret).toBeNull();
  });

  it("с верным паролем выдаёт секрет и ссылку для приложения", async () => {
    const user = await makeUser("OWNER");
    const setup = await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
  });

  it("перебор пароля через это окно закрывается после пяти попыток", async () => {
    const user = await makeUser("OWNER");
    for (let i = 0; i < 5; i++) {
      await expect(
        startTwoFactorSetup({ userId: user.id, issuer: "X", password: `неверный-пароль-${i}-xx` }),
      ).rejects.toThrow(/Пароль неверен/);
    }
    // Шестая — даже с верным паролем: проверка не выполняется
    await expect(
      startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD }),
    ).rejects.toThrow(/Слишком много/);
  });

  it("подтверждение кодом перебирается не бесконечно: после десяти неверных закрыто", async () => {
    const user = await makeUser("OWNER");
    const { secret } = await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    const wrong = totp(secret) === "000000" ? "111111" : "000000";

    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => confirmTwoFactor({ userId: user.id, code: wrong })),
    );
    const blocked = results.filter(
      (r) => r.status === "rejected" && /Слишком много/.test(String(r.reason?.message)),
    );
    // Десять попыток под замком, остальные пятнадцать отказаны без проверки кода
    expect(blocked).toHaveLength(15);
    // Верный код после этого тоже не принимается: окно закрыто
    await expect(confirmTwoFactor({ userId: user.id, code: totp(secret) })).rejects.toThrow(/Слишком много/);
  });

  it("сбитые часы телефона: несколько неверных кодов подряд не закрывают ни подтверждение, ни новый старт", async () => {
    const user = await makeUser("RECRUITER");
    const { secret } = await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    const wrong = totp(secret) === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i++) {
      await expect(confirmTwoFactor({ userId: user.id, code: wrong })).rejects.toThrow(/Код не подошёл/);
    }
    // Сотрудник начинает заново — пароль принимается, «подождите 15 минут» нет
    const again = await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    // …и подтверждает верным кодом
    await expect(confirmTwoFactor({ userId: user.id, code: totp(again.secret) })).resolves.toHaveLength(10);
  });

  it("успешный старт не расходует попытки: много раз подряд начать можно", async () => {
    const user = await makeUser("RECRUITER");
    for (let i = 0; i < 8; i++) {
      await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    }
  });

  it("неверные пароли при старте не отнимают попыток у подтверждения кода", async () => {
    const user = await makeUser("RECRUITER");
    for (let i = 0; i < 5; i++) {
      await expect(
        startTwoFactorSetup({ userId: user.id, issuer: "X", password: `не-тот-пароль-${i}-xx` }),
      ).rejects.toThrow(/Пароль неверен/);
    }
    // Старт закрыт, но у подтверждения свой счётчик — он не тронут
    const key = `login:2fa-setup-confirm:${user.id}`;
    expect(await db.authFailure.count({ where: { key } })).toBe(0);
  });

  it("без пароля, с проверенным телефоном: код из SMS", async () => {
    const user = await makeUser("CLIENT_ADMIN", { passwordless: true, phoneVerified: PHONE });

    await expect(startTwoFactorSetup({ userId: user.id, issuer: "X" })).rejects.toThrow(/SMS|код/i);
    await expect(
      startTwoFactorSetup({ userId: user.id, issuer: "X", smsCode: "000000" }),
    ).rejects.toThrow(TwoFactorError);

    await requestPhoneCode(PHONE);
    const code = (sent.at(-1)?.text ?? "").match(/\d{6}/)?.[0] ?? "";
    const setup = await startTwoFactorSetup({ userId: user.id, issuer: "X", smsCode: code });
    expect(setup.secret).toBeTruthy();

    // Код из SMS одноразовый: повторно им не включить
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true } });
    await db.user.update({ where: { id: row.id }, data: { totpSecret: null } });
    await expect(startTwoFactorSetup({ userId: user.id, issuer: "X", smsCode: code })).rejects.toThrow(
      TwoFactorError,
    );
  });

  it("без пароля и без телефона — сначала пароль, через «Забыли пароль»", async () => {
    const user = await makeUser("CLIENT_ADMIN", { passwordless: true });
    await expect(startTwoFactorSetup({ userId: user.id, issuer: "X" })).rejects.toThrow(/Забыли пароль/);
  });
});

describe("отключение", () => {
  it("сотрудникам агентства не отключается — ни с каким паролем", async () => {
    for (const role of ["OWNER", "HEAD", "RECRUITER", "ACCOUNT"] as const) {
      const user = await makeUser(role);
      await enableTwoFactorForTest(user.id);
      await expect(disableTwoFactor({ userId: user.id, password: PASSWORD }), role).rejects.toThrow(
        /обязательн/,
      );
      expect((await getTwoFactorStatus(user.id)).enabled, role).toBe(true);
    }
  });

  it("клиенту можно, как раньше, — с паролем", async () => {
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    const user = await makeUser("CLIENT_ADMIN", { clientId: client.id });
    await enableTwoFactorForTest(user.id);
    await expect(disableTwoFactor({ userId: user.id, password: "не-тот-пароль-совсем" })).rejects.toThrow(
      /Пароль неверен/,
    );
    await disableTwoFactor({ userId: user.id, password: PASSWORD });
    expect((await getTwoFactorStatus(user.id)).enabled).toBe(false);
  });

  it("статус сообщает, обязательна ли 2FA", async () => {
    const owner = await makeUser("OWNER");
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    const customer = await makeUser("CLIENT_ADMIN", { clientId: client.id });
    expect((await getTwoFactorStatus(owner.id)).required).toBe(true);
    expect((await getTwoFactorStatus(customer.id)).required).toBe(false);
  });
});

describe("секрет в базе", () => {
  it("в проде без ключа шифрования секрет открытым текстом не сохраняется", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "");
    const user = await makeUser("OWNER");

    expect(() => sealTotpSecret(generateSecret())).toThrow(/TOTP_ENCRYPTION_KEY/);
    await expect(startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD })).rejects.toThrow(
      TwoFactorError,
    );

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
    expect(row.totpSecret).toBeNull();
  });

  it("в проде слишком короткий ключ — то же самое: он молча не применяется", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "коротко");
    expect(() => sealTotpSecret(generateSecret())).toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it("в проде с ключом секрет шифруется", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "k".repeat(40));
    const user = await makeUser("OWNER");

    await startTwoFactorSetup({ userId: user.id, issuer: "X", password: PASSWORD });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
    expect(row.totpSecret).toMatch(/^enc:v1:/);
  });

  it("вне прода без ключа — как раньше, открытым текстом (разработка и тесты)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "");
    const secret = generateSecret();
    expect(sealTotpSecret(secret)).toBe(secret);
  });
});
