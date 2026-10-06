/**
 * Журнал входов: что пишется, чем защищено и сколько живёт.
 *
 * Главное: журнал не ломает вход (сбой записи — строка в логе), не хранит
 * почту открыто и секретов, не задерживает ответ и стирается через 90 дней.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { totp } from "@/lib/auth/totp";
import { prismaRaw as db } from "@/lib/db/prisma";
import { resetRateLimits } from "@/lib/security/rate-limit";
import {
  describeUserAgent,
  emailFingerprint,
  listAuthEvents,
  recordAuthEvent,
  recordAuthEventSoon,
} from "@/lib/services/auth-events";
import { AUTH_EVENT_RETENTION_DAYS, purgeAuthLogs } from "@/lib/services/auth-events-retention";
import { authenticateWithPassword, LoginError } from "@/lib/services/credentials-login";
import { confirmTwoFactor, startTwoFactorSetup } from "@/lib/services/two-factor";
import { getResetTarget, requestPasswordReset, resetPassword } from "@/lib/services/passwords";

import { enableTwoFactorForTest } from "./two-factor-fixtures";

const MARK = "test-authevent";
const ORG = "org_fattakhov";
const PASSWORD = "kofe-s-molokom-v-pyatnitsu";
const EMAIL = `${MARK}-user@example.com`;

let userId = "";

async function cleanup() {
  await db.authFailure.deleteMany({ where: { key: { contains: MARK } } });
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  // События по неизвестным адресам привязаны не к пользователю, а к отпечатку почты
  const prints = [EMAIL, `${MARK}-nobody@example.com`].map((e) => emailFingerprint(e)!);
  await db.authEvent.deleteMany({ where: { OR: [{ userId: { in: ids } }, { emailHash: { in: prints } }] } });
  await db.authFailure.deleteMany({
    where: { OR: ids.flatMap((id) => [{ key: `login:2fa:${id}` }, { key: `login:2fa-setup:${id}` }]) },
  });
  await db.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  resetRateLimits();
  await cleanup();
  const user = await db.user.create({
    data: {
      organizationId: ORG,
      email: EMAIL,
      fullName: "Журнал Входов",
      role: "RECRUITER",
      passwordHash: await hashPassword(PASSWORD),
    },
    select: { id: true },
  });
  userId = user.id;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/** Записи — в фоне, не ждём базы; ждём в тесте, пока они там появятся. */
async function eventsOf(where: Record<string, unknown>, expected: number) {
  for (let i = 0; i < 50; i++) {
    const rows = await db.authEvent.findMany({ where, orderBy: { createdAt: "asc" } });
    if (rows.length >= expected) return rows;
    await new Promise((r) => setTimeout(r, 40));
  }
  return db.authEvent.findMany({ where, orderBy: { createdAt: "asc" } });
}

describe("запись события", () => {
  it("почта — отпечаток HMAC на AUTH_SECRET, а не открытый текст; браузер усечён до 255", async () => {
    await recordAuthEvent({
      kind: "LOGIN_OK",
      userId,
      email: ` ${EMAIL.toUpperCase()} `,
      ip: "203.0.113.7",
      userAgent: "A".repeat(600),
      details: { method: "password" },
    });
    const [row] = await eventsOf({ userId }, 1);
    expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.emailHash).toBe(emailFingerprint(EMAIL));
    expect(JSON.stringify(row)).not.toContain(EMAIL);
    expect(row.userAgent).toHaveLength(255);
    expect(row.ip).toBe("203.0.113.7");
  });

  it("отпечаток зависит от ключа: другой AUTH_SECRET — другой отпечаток", () => {
    const first = emailFingerprint(EMAIL);
    vi.stubEnv("AUTH_SECRET", "совсем-другой-секрет-для-проверки-отпечатка");
    expect(emailFingerprint(EMAIL)).not.toBe(first);
  });

  it("сбой базы не бросает: вход не должен падать из-за журнала", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // Значение, которое база не примет (нулевой байт в тексте): запись гарантированно падает
    const broken = { kind: "LOGIN_OK", userId, ip: "203.0.113.\u0000" } as const;

    await expect(recordAuthEvent(broken)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();

    expect(() => recordAuthEventSoon(broken)).not.toThrow();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("запись «в фоне» не ждёт базы: вызов синхронный и ничего не возвращает", async () => {
    // Не обещание: вызывающему нечего ждать (по времени не меряем — это флаки на нагрузке)
    const result = recordAuthEventSoon({ kind: "LOGIN_OK", userId, ip: "203.0.113.8", userAgent: null });
    expect(result).toBeUndefined();

    // А запись при этом доходит до базы
    const [row] = await eventsOf({ userId, kind: "LOGIN_OK" }, 1);
    expect(row.ip).toBe("203.0.113.8");
  });
});

describe("вход пишет события", () => {
  it("успешный вход — LOGIN_OK с пользователем и способом", async () => {
    await authenticateWithPassword({ email: EMAIL, password: PASSWORD });
    const [row] = await eventsOf({ userId, kind: "LOGIN_OK" }, 1);
    expect(row.details).toMatchObject({ method: "password", secondFactor: false });
    expect(row.emailHash).toBe(emailFingerprint(EMAIL));
  });

  it("неверный пароль — LOGIN_FAIL; у неизвестного адреса пользователя нет, отпечаток есть", async () => {
    await expect(authenticateWithPassword({ email: EMAIL, password: "не-тот-пароль-совсем" })).rejects.toThrow(
      LoginError,
    );
    const unknown = `${MARK}-nobody@example.com`;
    await expect(authenticateWithPassword({ email: unknown, password: PASSWORD })).rejects.toThrow(LoginError);

    const [known] = await eventsOf({ userId, kind: "LOGIN_FAIL" }, 1);
    expect(known.details).toMatchObject({ method: "password", reason: "bad_credentials" });

    const byUnknown = await eventsOf({ emailHash: emailFingerprint(unknown) }, 1);
    expect(byUnknown[0].userId).toBeNull();
    expect(byUnknown[0].kind).toBe("LOGIN_FAIL");
  });

  it("в журнале нет паролей и кодов", async () => {
    await expect(authenticateWithPassword({ email: EMAIL, password: "секретный-неверный-пароль" })).rejects.toThrow();
    await eventsOf({ userId, kind: "LOGIN_FAIL" }, 1);
    const all = JSON.stringify(await db.authEvent.findMany({ where: { userId } }));
    expect(all).not.toContain("секретный-неверный-пароль");
    expect(all).not.toContain(PASSWORD);
  });

  it("блокировка входа тоже в журнале: LOGIN_FAIL с причиной blocked", async () => {
    for (let i = 0; i < 10; i++) {
      await expect(authenticateWithPassword({ email: EMAIL, password: `неверный-${i}-пароль-xx` })).rejects.toThrow();
    }
    await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow(LoginError);

    const rows = await eventsOf({ kind: "LOGIN_FAIL", emailHash: emailFingerprint(EMAIL) }, 11);
    expect(rows.filter((r) => (r.details as { reason?: string }).reason === "blocked")).toHaveLength(1);
  });

  it("неверный код 2FA — TWO_FACTOR_FAIL, верный — LOGIN_OK с отметкой второго фактора", async () => {
    const { secret } = await enableTwoFactorForTest(userId);

    await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "second_factor_required",
    });
    const wrong = totp(secret) === "000000" ? "111111" : "000000";
    await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD, code: wrong })).rejects.toMatchObject({
      code: "second_factor_invalid",
    });
    await authenticateWithPassword({ email: EMAIL, password: PASSWORD, code: totp(secret) });

    const [fail] = await eventsOf({ userId, kind: "TWO_FACTOR_FAIL" }, 1);
    expect(fail.details).toMatchObject({ reason: "wrong" });
    const [ok] = await eventsOf({ userId, kind: "LOGIN_OK" }, 1);
    expect(ok.details).toMatchObject({ secondFactor: true });
  });
});

describe("события доступа", () => {
  it("сброс пароля по ссылке — PASSWORD_RESET", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await requestPasswordReset({ email: EMAIL });
    const token = info.mock.calls.flat().join("\n").match(/\/reset\/([A-Za-z0-9_-]+)/)?.[1];
    info.mockRestore();
    expect(await getResetTarget(token!)).not.toBeNull();

    await resetPassword({ token: token!, newPassword: "ryzhiy-kot-na-podokonnike" });

    const [row] = await eventsOf({ userId, kind: "PASSWORD_RESET" }, 1);
    expect(row.details).toMatchObject({ method: "link" });
  });

  it("включение 2FA — TWO_FACTOR_ENABLED", async () => {
    const setup = await startTwoFactorSetup({ userId, issuer: "X", password: PASSWORD });
    await confirmTwoFactor({ userId, code: totp(setup.secret) });

    const [row] = await eventsOf({ userId, kind: "TWO_FACTOR_ENABLED" }, 1);
    expect(row).toBeTruthy();
  });
});

describe("хранение и просмотр", () => {
  it("старше 90 дней стирается, свежее остаётся; счётчик неудач старше суток — тоже", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - (AUTH_EVENT_RETENTION_DAYS + 1) * 86_400_000);
    const fresh = new Date(now.getTime() - (AUTH_EVENT_RETENTION_DAYS - 1) * 86_400_000);
    await db.authEvent.createMany({
      data: [
        { kind: "LOGIN_OK", userId, createdAt: old },
        { kind: "LOGIN_OK", userId, createdAt: fresh },
      ],
    });
    await db.authFailure.createMany({
      data: [
        { key: `${MARK}:old`, at: new Date(now.getTime() - 25 * 3_600_000) },
        { key: `${MARK}:fresh`, at: now },
      ],
    });

    const removed = await purgeAuthLogs(now);

    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db.authEvent.findMany({ where: { userId } });
    expect(left).toHaveLength(1);
    expect(left[0].createdAt.getTime()).toBe(fresh.getTime());
    const failures = await db.authFailure.findMany({ where: { key: { startsWith: MARK } } });
    expect(failures.map((f) => f.key)).toEqual([`${MARK}:fresh`]);
  });

  it("очистка входит в плановый проход фоновых задач", async () => {
    // Сам проход ходит в хранилище и каналы — гонять его ради этого незачем:
    // важно, что очистка стоит в нём, а не живёт отдельным планировщиком
    const source = (await import("node:fs")).readFileSync("jobs/tasks.ts", "utf8");
    expect(source).toContain("purgeAuthLogs()");
  });

  it("список: последние события, фильтр «только неудачные», лимит; не-владельцу отказ", async () => {
    await db.authEvent.createMany({
      data: [
        { kind: "LOGIN_OK", userId, organizationId: ORG },
        { kind: "LOGIN_FAIL", userId, organizationId: ORG },
        { kind: "TWO_FACTOR_FAIL", userId, organizationId: ORG },
        { kind: "PASSWORD_RESET", userId, organizationId: ORG },
      ],
    });
    const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };

    const all = await listAuthEvents(owner, { limit: 200 });
    expect(all.filter((e) => e.user?.email === EMAIL)).toHaveLength(4);

    const failed = await listAuthEvents(owner, { onlyFailed: true });
    expect(failed.every((e) => e.kind === "LOGIN_FAIL" || e.kind === "TWO_FACTOR_FAIL")).toBe(true);
    expect(failed.filter((e) => e.user?.email === EMAIL)).toHaveLength(2);

    expect(await listAuthEvents(owner, { limit: 1 })).toHaveLength(1);

    const recruiter: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
    await expect(listAuthEvents(recruiter)).rejects.toThrow(/Доступ запрещён/);
  });

  it("события другой организации не видны", async () => {
    const other = await db.organization.create({ data: { name: `${MARK} Чужая`, inn: "1650000999" } });
    const stranger = await db.user.create({
      data: { organizationId: other.id, email: `${MARK}-stranger@example.com`, fullName: "Чужой", role: "OWNER" },
    });
    // Организация проставляется при записи по пользователю — вызывающему её знать не нужно
    await recordAuthEvent({ kind: "LOGIN_OK", userId: stranger.id, ip: "203.0.113.20" });
    const stored = await db.authEvent.findFirstOrThrow({ where: { userId: stranger.id } });
    expect(stored.organizationId).toBe(other.id);
    const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };

    const seen = await listAuthEvents(owner);
    expect(seen.some((e) => e.user?.email.includes("stranger"))).toBe(false);
    expect(seen.some((e) => e.ip === "203.0.113.20")).toBe(false);

    await db.authEvent.deleteMany({ where: { userId: stranger.id } });
    await db.user.delete({ where: { id: stranger.id } });
    await db.organization.delete({ where: { id: other.id } });
  });
});

describe("журнал не засоряется", () => {
  const unknown = `${MARK}-nobody@example.com`;

  it("блокировка входа: одна запись в 5 минут на аккаунт, сколько бы ни стучались", { timeout: 60_000 }, async () => {
    for (let i = 0; i < 10; i++) {
      await expect(authenticateWithPassword({ email: EMAIL, password: `неверный-${i}-пароль-xx` })).rejects.toThrow();
    }
    for (let i = 0; i < 15; i++) {
      await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow(LoginError);
    }

    const rows = await eventsOf({ kind: "LOGIN_FAIL", emailHash: emailFingerprint(EMAIL) }, 11);
    // Десять неудач пароля (каждая — отдельное событие) и ровно одна блокировка из пятнадцати
    expect(rows.filter((r) => (r.details as { reason?: string }).reason === "blocked")).toHaveLength(1);
    expect(rows.filter((r) => (r.details as { reason?: string }).reason === "bad_credentials")).toHaveLength(10);
  });

  it("по истечении пяти минут блокировка снова попадает в журнал", { timeout: 60_000 }, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let i = 0; i < 10; i++) {
        await expect(authenticateWithPassword({ email: EMAIL, password: `неверный-${i}-пароль-xx` })).rejects.toThrow();
      }
      await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow();
      vi.setSystemTime(Date.now() + 301_000);
      await expect(authenticateWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
    const rows = await eventsOf({ kind: "LOGIN_FAIL", emailHash: emailFingerprint(EMAIL) }, 12);
    expect(rows.filter((r) => (r.details as { reason?: string }).reason === "blocked")).toHaveLength(2);
  });

  it("перебор неизвестных адресов с одного IP: не больше десяти записей в минуту", { timeout: 60_000 }, async () => {
    for (let i = 0; i < 14; i++) {
      await expect(
        authenticateWithPassword({ email: `${MARK}-nobody${i}@example.com`, password: PASSWORD }),
      ).rejects.toThrow(LoginError);
    }
    await new Promise((r) => setTimeout(r, 300));
    const prints = Array.from({ length: 14 }, (_, i) => emailFingerprint(`${MARK}-nobody${i}@example.com`)!);
    const rows = await db.authEvent.findMany({ where: { emailHash: { in: prints } } });
    expect(rows).toHaveLength(10);
    await db.authEvent.deleteMany({ where: { emailHash: { in: prints } } });
  });

  it("неудачи настоящей учётки пишутся всегда, перебором неизвестных адресов их не вытеснить", { timeout: 60_000 }, async () => {
    for (let i = 0; i < 12; i++) {
      await expect(
        authenticateWithPassword({ email: `${MARK}-nobody${i}@example.com`, password: PASSWORD }),
      ).rejects.toThrow(LoginError);
    }
    await expect(authenticateWithPassword({ email: EMAIL, password: "не-тот-пароль-совсем" })).rejects.toThrow();

    const rows = await eventsOf({ userId, kind: "LOGIN_FAIL" }, 1);
    expect(rows).toHaveLength(1);
    const prints = Array.from({ length: 12 }, (_, i) => emailFingerprint(`${MARK}-nobody${i}@example.com`)!);
    await db.authEvent.deleteMany({ where: { emailHash: { in: prints } } });
    expect(unknown).toBeTruthy();
  });
});

describe("браузер — коротко", () => {
  it("узнаёт частые браузеры и системы", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome 126, Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari 17, iOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      ),
    ).toBe("Edge 125, Windows");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe(
      "Firefox 127, Windows",
    );
    expect(describeUserAgent("curl/8.4.0")).toBe("Скрипт");
    expect(describeUserAgent(null)).toBe("—");
  });
});
