/**
 * Оповещения о взломе: правила поверх журнала входов.
 *
 * Проверяется два вопроса: срабатывает ли правило ровно на своём пороге
 * (не раньше и не на мелочах) и что именно уходит в каналы. В ВК и пуш —
 * только заголовок: ни имён, ни адресов. Каналы подменены, база настоящая.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { to?: string; subject?: string; userId?: string; text: string };
type Pushed = { userId: string; message: { title: string; body?: string; url?: string } };

const sent = vi.hoisted(() => ({
  email: [] as Sent[],
  vk: [] as Sent[],
  push: [] as Pushed[],
  failNext: false,
}));

vi.mock("@/lib/notifications/channels", () => ({
  getEmailTransport: () => ({
    send: async (m: Sent) => {
      if (sent.failNext) throw new Error("SMTP недоступен");
      sent.email.push(m);
    },
  }),
  getVkTransport: () => ({ send: async (m: Sent) => void sent.vk.push(m) }),
}));

vi.mock("@/lib/notifications/push", () => ({
  sendPushToUser: async (userId: string, message: Pushed["message"]) => {
    sent.push.push({ userId, message });
    return { sent: 1, removed: 0, failed: 0, outcomes: [{ state: "sent" }] };
  },
}));

import { prismaRaw as db } from "@/lib/db/prisma";
import type { AuthEventKind } from "@/lib/generated/prisma/enums";
import { resetAlertSilence } from "@/lib/monitoring/alerts";
import {
  ALERT_THRESHOLDS,
  evaluateSecurityAlerts,
  type SecurityEventInput,
} from "@/lib/monitoring/security-alerts";
import { emailFingerprint, recordAuthEvent } from "@/lib/services/auth-events";

const MARK = "test-secalert";
const ORG = "org_fattakhov";
const OWNER = "usr_owner";
/** Адреса из блока документации (TEST-NET-3): настоящим пользователям не принадлежат. */
const IP_A = "203.0.113.10";
const IP_B = "203.0.113.11";

let head = "";
let recruiter = "";
const prints = [`${MARK}-nobody@example.com`, ...Array.from({ length: 6 }, (_, i) => `${MARK}-g${i}@example.com`)].map(
  (e) => emailFingerprint(e)!,
);

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.authEvent.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { emailHash: { in: prints } }, { ip: { in: [IP_A, IP_B] } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  resetAlertSilence();
  sent.email.length = 0;
  sent.vk.length = 0;
  sent.push.length = 0;
  sent.failNext = false;
  vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");
  await cleanup();
  head = (
    await db.user.create({
      data: { organizationId: ORG, email: `${MARK}-head@example.com`, fullName: "Тест Руководитель", role: "HEAD" },
      select: { id: true },
    })
  ).id;
  recruiter = (
    await db.user.create({
      data: { organizationId: ORG, email: `${MARK}-rec@example.com`, fullName: "Тест Рекрутер", role: "RECRUITER" },
      select: { id: true },
    })
  ).id;
  await db.user.update({ where: { id: OWNER }, data: { vkUserId: "400500600" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await cleanup();
  await db.user.update({ where: { id: OWNER }, data: { vkUserId: null } });
  await db.$disconnect();
});

function input(partial: Partial<SecurityEventInput> & { kind: AuthEventKind }): SecurityEventInput {
  return {
    userId: null,
    emailHash: null,
    ip: IP_A,
    device: "Chrome, Windows",
    details: null,
    newDevice: false,
    ...partial,
  };
}

/** Записать события в журнал, как это делает recordAuthEvent, и вернуть последнее. */
async function log(
  n: number,
  data: { kind: AuthEventKind; userId?: string; emailHash?: string; ip?: string },
) {
  await db.authEvent.createMany({
    data: Array.from({ length: n }, () => ({
      kind: data.kind,
      userId: data.userId ?? null,
      emailHash: data.emailHash ?? null,
      ip: data.ip ?? IP_A,
      organizationId: data.userId ? ORG : null,
    })),
  });
  return input({ kind: data.kind, userId: data.userId ?? null, emailHash: data.emailHash ?? null, ip: data.ip ?? IP_A });
}

describe("перебор пароля по одной учётной записи", () => {
  it("на пороге в 5 неудач срабатывает, на 4 — нет", async () => {
    const below = await log(ALERT_THRESHOLDS.failsPerAccount - 1, { kind: "LOGIN_FAIL", userId: recruiter });
    expect(await evaluateSecurityAlerts(below)).toEqual([]);
    expect(sent.email).toHaveLength(0);

    const at = await log(1, { kind: "LOGIN_FAIL", userId: recruiter });
    expect(await evaluateSecurityAlerts(at)).toEqual(["account-bruteforce"]);
    expect(sent.email).toHaveLength(1);
    expect(sent.email[0].to).toBe("bugs@example.ru");
    expect(sent.email[0].subject).toContain("Безопасность");
    expect(sent.email[0].text).toContain("Тест Рекрутер");
    expect(sent.email[0].text).toContain(IP_A);
  });

  it("неверные коды 2FA считаются вместе с паролями", async () => {
    await log(3, { kind: "LOGIN_FAIL", userId: recruiter });
    const last = await log(2, { kind: "TWO_FACTOR_FAIL", userId: recruiter });
    expect(await evaluateSecurityAlerts(last)).toEqual(["account-bruteforce"]);
  });

  it("повтор того же признака не приходит второй раз за 30 минут", async () => {
    const e = await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", userId: recruiter });
    await evaluateSecurityAlerts(e);
    await evaluateSecurityAlerts(await log(1, { kind: "LOGIN_FAIL", userId: recruiter }));
    expect(sent.email).toHaveLength(1);
  });

  it("несуществующий адрес: сообщение без этого адреса", async () => {
    const nobody = emailFingerprint(`${MARK}-nobody@example.com`)!;
    const e = await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", emailHash: nobody });
    expect(await evaluateSecurityAlerts(e)).toEqual(["account-bruteforce"]);
    expect(sent.email[0].text).toContain("несуществующему адресу");
    expect(sent.email[0].text).not.toContain(`${MARK}-nobody@example.com`);
  });

  it("в ВК и пуш уходит только заголовок: без имени и адреса", async () => {
    const e = await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", userId: recruiter });
    await evaluateSecurityAlerts(e);

    expect(sent.vk.map((m) => m.userId)).toEqual(["400500600"]);
    expect(sent.vk[0].text).toContain("Подбор пароля");
    expect(sent.vk[0].text).not.toContain("Тест Рекрутер");
    expect(sent.vk[0].text).not.toContain(IP_A);
    for (const p of sent.push) {
      expect(JSON.stringify(p.message)).not.toContain("Тест Рекрутер");
      expect(JSON.stringify(p.message)).not.toContain(IP_A);
    }
  });
});

describe("перебор с одного адреса", () => {
  it("много разных учёток с одного IP — сработает, хотя на каждую по одной попытке", async () => {
    let last!: SecurityEventInput;
    for (let i = 0; i < ALERT_THRESHOLDS.distinctAccountsPerIp; i++) {
      last = await log(1, { kind: "LOGIN_FAIL", emailHash: prints[i + 1], ip: IP_B });
    }
    expect(await evaluateSecurityAlerts(last)).toEqual(["ip-bruteforce"]);
    expect(sent.email[0].text).toContain(IP_B);
    expect(sent.email[0].text).toContain("вуз или общежитие");
  });

  it("несколько неудач с одного IP на мало учёток — тишина", async () => {
    let last!: SecurityEventInput;
    for (let i = 0; i < 3; i++) last = await log(2, { kind: "LOGIN_FAIL", emailHash: prints[i + 1], ip: IP_B });
    expect(await evaluateSecurityAlerts(last)).toEqual([]);
    expect(sent.email).toHaveLength(0);
  });
});

describe("успешный вход после серии неудач", () => {
  it("после 5 неудач — срабатывает", async () => {
    await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", userId: recruiter });
    const ok = await log(1, { kind: "LOGIN_OK", userId: recruiter });
    expect(await evaluateSecurityAlerts(ok)).toEqual(["login-after-failures"]);
    expect(sent.email[0].text).toContain("Возможно, пароль подобран");
  });

  it("после пары опечаток — тишина", async () => {
    await log(2, { kind: "LOGIN_FAIL", userId: recruiter });
    const ok = await log(1, { kind: "LOGIN_OK", userId: recruiter });
    expect(await evaluateSecurityAlerts(ok)).toEqual([]);
    expect(sent.email).toHaveLength(0);
  });
});

describe("действия с доступом руководителя", () => {
  it("вход руководителя с нового устройства — сообщение; у рекрутера — нет", async () => {
    const headOk = { ...(await log(1, { kind: "LOGIN_OK", userId: head })), newDevice: true };
    expect(await evaluateSecurityAlerts(headOk)).toEqual(["privileged-new-device"]);

    const recOk = { ...(await log(1, { kind: "LOGIN_OK", userId: recruiter })), newDevice: true };
    expect(await evaluateSecurityAlerts(recOk)).toEqual([]);
    expect(sent.email).toHaveLength(1);
  });

  it("сброс 2FA и завершение сессий у руководителя — сообщение; у рекрутера — нет", async () => {
    expect(await evaluateSecurityAlerts(input({ kind: "TWO_FACTOR_RESET", userId: head }))).toEqual([
      "privileged-access-change",
    ]);
    expect(await evaluateSecurityAlerts(input({ kind: "SESSIONS_REVOKED", userId: head }))).toEqual([
      "privileged-access-change",
    ]);
    expect(await evaluateSecurityAlerts(input({ kind: "SESSIONS_REVOKED", userId: recruiter }))).toEqual([]);
    expect(sent.email).toHaveLength(2);
  });
});

describe("надёжность", () => {
  it("недоступная почта не роняет проверку", async () => {
    sent.failNext = true;
    const e = await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", userId: recruiter });
    await expect(evaluateSecurityAlerts(e)).resolves.toEqual(["account-bruteforce"]);
  });

  it("без ящика под сбои письма нет, сигнал в ВК всё равно идёт", async () => {
    vi.stubEnv("ALERT_EMAIL", "");
    const e = await log(ALERT_THRESHOLDS.failsPerAccount, { kind: "LOGIN_FAIL", userId: recruiter });
    await evaluateSecurityAlerts(e);
    expect(sent.email).toHaveLength(0);
    expect(sent.vk).toHaveLength(1);
  });

  it("подключено к журналу: пятая неудача через recordAuthEvent поднимает тревогу", async () => {
    for (let i = 0; i < ALERT_THRESHOLDS.failsPerAccount; i++) {
      await recordAuthEvent({
        kind: "LOGIN_FAIL",
        userId: recruiter,
        email: `${MARK}-rec@example.com`,
        ip: IP_A,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      });
    }
    await vi.waitFor(() => expect(sent.email).toHaveLength(1), { timeout: 5000 });
    expect(sent.email[0].subject).toContain("Безопасность");
  });
});
