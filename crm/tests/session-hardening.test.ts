/**
 * Защита от кражи сессии (cookie).
 *
 * Украденная cookie даёт вход без пароля и 2FA. Закрыть кражу целиком
 * нельзя, поэтому проверяется то, что сжимает окно и даёт способ оборвать
 * чужой доступ: предельный возраст сессии, «выйти на всех устройствах» и
 * письмо о входе с нового устройства.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "", issuedAt: 0 }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: state.userId, issuedAt: state.issuedAt } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { hashPassword } from "@/lib/auth/password";
import { requireActor } from "@/lib/auth/session";
import {
  DEFAULT_AGENCY_SESSION_HOURS,
  DEFAULT_CLIENT_SESSION_HOURS,
  isSessionTooOld,
  sessionMaxAgeSeconds,
} from "@/lib/auth/session-policy";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { recordAuthEvent } from "@/lib/services/auth-events";
import { deviceKey } from "@/lib/services/new-device";
import { revokeAllSessions } from "@/lib/services/sessions";

const MARK = "test-sessharden";
const ORG = "org_fattakhov";
const nowSec = () => Math.floor(Date.now() / 1000);

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CHROME_WIN_NEWER = CHROME_WIN.replace("Chrome/126", "Chrome/131");
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function makeUser(role: "OWNER" | "CLIENT_ADMIN", clientId?: string) {
  const email = `${MARK}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const user = await db.user.create({
    data: {
      organizationId: ORG,
      email,
      fullName: "Тест Сессии",
      role,
      clientId,
      passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
    },
    select: { id: true, email: true },
  });
  return user;
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  await db.authEvent.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("предельный возраст сессии", () => {
  it("у агентства короче, чем у заказчика", () => {
    expect(sessionMaxAgeSeconds("agency")).toBe(DEFAULT_AGENCY_SESSION_HOURS * 3600);
    expect(sessionMaxAgeSeconds("client")).toBe(DEFAULT_CLIENT_SESSION_HOURS * 3600);
    expect(sessionMaxAgeSeconds("agency")).toBeLessThan(sessionMaxAgeSeconds("client"));
  });

  it("свежая сессия живёт, просроченная нет, без отметки выпуска — просрочена", () => {
    const now = Date.now();
    expect(isSessionTooOld(nowSec(), "agency", now)).toBe(false);
    expect(isSessionTooOld(nowSec() - 71 * 3600, "agency", now)).toBe(false);
    expect(isSessionTooOld(nowSec() - 73 * 3600, "agency", now)).toBe(true);
    expect(isSessionTooOld(null, "client", now)).toBe(true);
    expect(isSessionTooOld(undefined, "agency", now)).toBe(true);
  });

  it("срок можно поменять переменной, мусор в ней игнорируется", () => {
    vi.stubEnv("SESSION_MAX_HOURS_AGENCY", "8");
    expect(sessionMaxAgeSeconds("agency")).toBe(8 * 3600);
    for (const bad of ["0", "-5", "abc", "100000", ""]) {
      vi.stubEnv("SESSION_MAX_HOURS_AGENCY", bad);
      expect(sessionMaxAgeSeconds("agency")).toBe(DEFAULT_AGENCY_SESSION_HOURS * 3600);
    }
  });

  it("просроченная сессия заказчика отклоняется на входе в кабинет, свежая пускает", async () => {
    const user = await makeUser("OWNER");
    const client = await db.client.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const clientUser = await makeUser("CLIENT_ADMIN", client.id);
    state.userId = clientUser.id;

    state.issuedAt = nowSec();
    expect((await requireActor()).id).toBe(clientUser.id);

    state.issuedAt = nowSec() - (DEFAULT_CLIENT_SESSION_HOURS + 1) * 3600;
    await expect(requireActor()).rejects.toThrow("REDIRECT:/login");
    expect(user.id).not.toBe(clientUser.id);
  });
});

describe("выйти на всех устройствах", () => {
  it("сессия, выпущенная до отзыва, перестаёт действовать, а пароль остаётся прежним", async () => {
    const client = await db.client.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const user = await makeUser("CLIENT_ADMIN", client.id);
    state.userId = user.id;
    state.issuedAt = nowSec() - 120;
    expect((await requireActor()).id).toBe(user.id);

    const before = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    await revokeAllSessions(user.id);

    await expect(requireActor()).rejects.toThrow("REDIRECT:/login");
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    expect(after.passwordHash).toBe(before.passwordHash);

    // новый вход после отзыва работает
    state.issuedAt = nowSec() + 2;
    expect((await requireActor()).id).toBe(user.id);
  });

  it("событие попадает в журнал входов", async () => {
    const user = await makeUser("OWNER");
    await revokeAllSessions(user.id);
    const events = await db.authEvent.findMany({ where: { userId: user.id, kind: "SESSIONS_REVOKED" } });
    expect(events).toHaveLength(1);
  });
});

describe("вход с нового устройства", () => {
  async function login(userId: string, userAgent: string, ip = "198.51.100.7") {
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await recordAuthEvent({ kind: "LOGIN_OK", userId, ip, userAgent, details: { method: "password" } });
      // письмо уходит в фоне
      await new Promise((resolve) => setTimeout(resolve, 150));
      return send.mock.calls.map(([message]) => message);
    } finally {
      send.mockRestore();
    }
  }

  it("версия браузера в сравнении не участвует", () => {
    expect(deviceKey("Chrome 126, Windows")).toBe("Chrome, Windows");
    expect(deviceKey("Яндекс Браузер 24, Windows")).toBe("Яндекс Браузер, Windows");
    expect(deviceKey("Safari 17, iOS")).toBe("Safari, iOS");
    expect(deviceKey("—")).toBe("—");
  });

  it("первый вход письма не шлёт, тот же браузер с новой версией — тоже", async () => {
    const user = await makeUser("OWNER");
    expect(await login(user.id, CHROME_WIN)).toHaveLength(0);
    expect(await login(user.id, CHROME_WIN_NEWER)).toHaveLength(0);
  });

  it("другой браузер или система — письмо владельцу учётки и пометка в журнале", async () => {
    const user = await makeUser("OWNER");
    await login(user.id, CHROME_WIN);

    const sent = await login(user.id, SAFARI_IPHONE);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toBe("Вход с нового устройства");
    expect(sent[0].text).toContain("Safari");
    expect(sent[0].text).toContain("iOS");
    expect(sent[0].text).toContain("Завершить все сессии");

    const flagged = await db.authEvent.findMany({ where: { userId: user.id, kind: "LOGIN_OK" }, orderBy: { createdAt: "asc" } });
    expect(flagged.map((e) => (e.details as { newDevice?: boolean } | null)?.newDevice === true)).toEqual([false, true]);

    // следующий вход с телефона уже знакомый
    expect(await login(user.id, SAFARI_IPHONE)).toHaveLength(0);
  });

  it("письма не шлёт ни неудачный вход, ни событие без пользователя", async () => {
    const user = await makeUser("OWNER");
    await login(user.id, CHROME_WIN);
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await recordAuthEvent({ kind: "LOGIN_FAIL", userId: user.id, userAgent: SAFARI_IPHONE, ip: "198.51.100.7" });
      await recordAuthEvent({ kind: "LOGIN_OK", userAgent: SAFARI_IPHONE, ip: "198.51.100.7" });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });
});
