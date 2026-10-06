/**
 * Привязка ВКонтакте: выдача кода, погашение, чужая страница, перебор.
 *
 * Пишет в тестовую базу. Все записи — с меткой MARK и убираются за собой.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  consumeVkLinkCode,
  issueVkLinkCode,
  unlinkVk,
  VK_LINK_FAILURE_LIMIT,
  VK_LINK_TTL_MS,
  vkLinkStatus,
} from "@/lib/notifications/vk-link";

const MARK = "test-vk-link";
const ORG = "org_fattakhov";

async function makeUser(suffix: string) {
  return db.user.create({
    data: {
      organizationId: ORG,
      email: `${MARK}-${suffix}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName: "Тест ВК",
      role: "RECRUITER",
    },
    select: { id: true },
  });
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: MARK } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.vkLinkCode.deleteMany({ where: { userId: { in: ids } } });
  await db.authFailure.deleteMany({ where: { key: { startsWith: "vk-link:" } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

// Уникальные страницы ВК на каждый тест — чтобы не столкнуться с прежними записями
let vkSeq = 0;
const nextVkId = () => String(910_000_000 + ++vkSeq);

describe("привязка ВКонтакте кодом", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "y".repeat(40));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });
  afterAll(cleanup);

  it("правильный код привязывает страницу к кабинету и гаснет", async () => {
    const user = await makeUser("ok");
    const { code } = await issueVkLinkCode(user.id);

    const first = await consumeVkLinkCode(nextVkId(), code);
    expect(first.status).toBe("linked");

    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).not.toBeNull();

    // Тот же код второй раз — уже не годится
    const again = await consumeVkLinkCode(nextVkId(), code);
    expect(again.status).toBe("bad-code");
  });

  it("новый код гасит прежний у того же человека", async () => {
    const user = await makeUser("reissue");
    const old = await issueVkLinkCode(user.id);
    const fresh = await issueVkLinkCode(user.id);

    expect((await consumeVkLinkCode(nextVkId(), old.code)).status).toBe("bad-code");
    expect((await consumeVkLinkCode(nextVkId(), fresh.code)).status).toBe("linked");
  });

  it("просроченный код не принимается", async () => {
    const user = await makeUser("expired");
    const past = new Date(Date.now() - VK_LINK_TTL_MS - 60_000);
    const { code } = await issueVkLinkCode(user.id, past);

    const outcome = await consumeVkLinkCode(nextVkId(), code);
    expect(outcome.status).toBe("expired");
  });

  it("страница, уже привязанная к другому кабинету, не перехватывается", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const vkId = nextVkId();
    await db.user.update({ where: { id: owner.id }, data: { vkUserId: vkId } });

    const { code } = await issueVkLinkCode(other.id);
    const outcome = await consumeVkLinkCode(vkId, code);
    expect(outcome.status).toBe("taken");

    const stillOwner = await db.user.findUniqueOrThrow({ where: { id: owner.id }, select: { vkUserId: true } });
    expect(stillOwner.vkUserId).toBe(vkId);
  });

  it("после лимита неудачных вводов с одной страницы код уже не проверяется", async () => {
    const user = await makeUser("bruteforce");
    const { code } = await issueVkLinkCode(user.id);
    const attacker = nextVkId();

    for (let i = 0; i < VK_LINK_FAILURE_LIMIT; i++) {
      expect((await consumeVkLinkCode(attacker, "000000")).status).toBe("bad-code");
    }
    // Даже правильный код с этой страницы теперь не пройдёт
    expect((await consumeVkLinkCode(attacker, code)).status).toBe("too-many-attempts");
  });

  it("отвязка снимает страницу", async () => {
    const user = await makeUser("unlink");
    const { code } = await issueVkLinkCode(user.id);
    await consumeVkLinkCode(nextVkId(), code);

    await unlinkVk(user.id);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBeNull();
  });

  it("после отвязки ту же страницу можно привязать снова — тем же человеком и новым кодом", async () => {
    const user = await makeUser("relink");
    const page = nextVkId();

    const first = await issueVkLinkCode(user.id);
    expect((await consumeVkLinkCode(page, first.code)).status).toBe("linked");
    await unlinkVk(user.id);

    const second = await issueVkLinkCode(user.id);
    expect((await consumeVkLinkCode(page, second.code)).status).toBe("linked");

    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBe(page);
  });

  it("«привязать заново» без отвязки заменяет страницу той, с которой написали", async () => {
    const user = await makeUser("replace");
    const pageA = nextVkId();
    const pageB = nextVkId();

    await consumeVkLinkCode(pageA, (await issueVkLinkCode(user.id)).code);
    const outcome = await consumeVkLinkCode(pageB, (await issueVkLinkCode(user.id)).code);

    expect(outcome.status).toBe("linked");
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBe(pageB);
  });

  it("страницу, отвязанную в одном кабинете, можно привязать к другому", async () => {
    const first = await makeUser("move-from");
    const second = await makeUser("move-to");
    const page = nextVkId();

    await consumeVkLinkCode(page, (await issueVkLinkCode(first.id)).code);
    // Пока привязана — второй кабинет её не получит
    expect((await consumeVkLinkCode(page, (await issueVkLinkCode(second.id)).code)).status).toBe("taken");

    await unlinkVk(first.id);
    expect((await consumeVkLinkCode(page, (await issueVkLinkCode(second.id)).code)).status).toBe("linked");
  });

  it("отвязка гасит выданные коды: старый код страницу обратно не привяжет", async () => {
    const user = await makeUser("unlink-kills-code");
    const { code } = await issueVkLinkCode(user.id);

    await unlinkVk(user.id);

    expect((await consumeVkLinkCode(nextVkId(), code)).status).toBe("bad-code");
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { vkUserId: true } });
    expect(stored.vkUserId).toBeNull();
  });
});

describe("опрос состояния кода (vkLinkStatus)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "y".repeat(40));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });
  afterAll(cleanup);

  it("ждёт, пока не написали; после сообщения — linked", async () => {
    const user = await makeUser("status-flow");
    const { code } = await issueVkLinkCode(user.id);

    expect((await vkLinkStatus(user.id, code)).status).toBe("waiting");

    await consumeVkLinkCode(nextVkId(), code);
    const after = await vkLinkStatus(user.id, code);
    expect(after.status).toBe("linked");
    expect(after.vkUserId).not.toBeNull();
  });

  it("просроченный код — expired", async () => {
    const user = await makeUser("status-expired");
    const { code } = await issueVkLinkCode(user.id, new Date(Date.now() - VK_LINK_TTL_MS - 60_000));
    expect((await vkLinkStatus(user.id, code)).status).toBe("expired");
  });

  it("код, погашенный отвязкой, — expired, а не «привязано»", async () => {
    const user = await makeUser("status-unlinked");
    const { code } = await issueVkLinkCode(user.id);
    await unlinkVk(user.id);
    expect((await vkLinkStatus(user.id, code)).status).toBe("expired");
  });

  it("чужой код и мусор для постороннего — просто expired, без подсказок", async () => {
    const owner = await makeUser("status-owner");
    const stranger = await makeUser("status-stranger");
    const { code } = await issueVkLinkCode(owner.id);

    expect((await vkLinkStatus(stranger.id, code)).status).toBe("expired");
    expect((await vkLinkStatus(stranger.id, "не код")).status).toBe("expired");
  });
});
