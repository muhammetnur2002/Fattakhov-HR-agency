/**
 * Токен приглашения в базе: только хеш и шифр, открытого текста нет.
 *
 * Ссылка приглашения — вход в кабинет с указанной ролью. Утечка базы
 * не должна давать рабочие ссылки; при этом команда по-прежнему видит ссылку
 * в списке «Ждут принятия» и может её скопировать.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  inviteTokenColumns,
  inviteTokenHash,
  openInviteToken,
  sealInviteToken,
} from "@/lib/auth/invite-token";
import { prismaRaw as db } from "@/lib/db/prisma";
import { listClientTeam } from "@/lib/services/clients";
import { acceptInvitation, createInvitation, getInvitation } from "@/lib/services/invitations";

const MARK = "test-invtoken";
const ORG = "org_fattakhov";
const KEY = "ключ-для-проверки-шифрования-приглашений-0123456789";

describe("шифр токена", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("с ключом: в шифре токена нет, читается обратно, чужой ключ не открывает", () => {
    vi.stubEnv("TOTP_ENCRYPTION_KEY", KEY);
    const token = "abcDEF123_-token";
    const sealed = sealInviteToken(token);
    expect(sealed).not.toBeNull();
    expect(sealed).not.toContain(token);
    expect(openInviteToken({ tokenEnc: sealed, token: null })).toBe(token);

    vi.stubEnv("TOTP_ENCRYPTION_KEY", KEY + "-другой");
    expect(openInviteToken({ tokenEnc: sealed, token: null })).toBeNull();
  });

  it("два шифра одного токена различаются", () => {
    vi.stubEnv("TOTP_ENCRYPTION_KEY", KEY);
    expect(sealInviteToken("same")).not.toBe(sealInviteToken("same"));
  });

  it("в production без ключа шифр не сохраняется: открытым токен не лежит", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "");
    expect(sealInviteToken("secret-token")).toBeNull();
    expect(inviteTokenColumns("secret-token")).toEqual({
      tokenHash: inviteTokenHash("secret-token"),
      tokenEnc: null,
    });
  });

  it("прежнее открытое поле читается, пока приглашение не переехало", () => {
    expect(openInviteToken({ tokenEnc: null, token: "legacy" })).toBe("legacy");
    expect(openInviteToken({ tokenEnc: null, token: null })).toBeNull();
  });

  it("хеш стабилен и не равен токену", () => {
    expect(inviteTokenHash("x")).toBe(inviteTokenHash("x"));
    expect(inviteTokenHash("x")).not.toBe("x");
    expect(inviteTokenHash("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("приглашение в базе", () => {
  let clientId: string;
  let authorId: string;

  async function cleanup() {
    await db.invitation.deleteMany({ where: { email: { startsWith: MARK } } });
  }

  beforeEach(async () => {
    vi.stubEnv("TOTP_ENCRYPTION_KEY", KEY);
    await cleanup();
    const client = await db.client.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    clientId = client.id;
    const author = await db.user.findFirstOrThrow({
      where: { organizationId: ORG, clientId: null, isActive: true },
      select: { id: true },
    });
    authorId = author.id;
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("токена в открытом виде нет ни в одной колонке", async () => {
    const token = await createInvitation({
      organizationId: ORG,
      email: `${MARK}-plain@example.com`,
      role: "CLIENT_HIRING",
      clientId,
      createdById: authorId,
    });
    const row = await db.invitation.findFirstOrThrow({ where: { email: `${MARK}-plain@example.com` } });
    expect(row.token).toBeNull();
    expect(row.tokenHash).toBe(inviteTokenHash(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await getInvitation(token)).not.toBeNull();
  });

  it("команда видит ту же ссылку, что ушла в письме", async () => {
    const token = await createInvitation({
      organizationId: ORG,
      email: `${MARK}-show@example.com`,
      role: "CLIENT_HIRING",
      clientId,
      createdById: authorId,
    });
    const team = await listClientTeam(clientId);
    expect(team.invitations.find((i) => i.email === `${MARK}-show@example.com`)?.token).toBe(token);
  });

  it("принятая ссылка стирается целиком и повторно не открывается", async () => {
    const token = await createInvitation({
      organizationId: ORG,
      email: `${MARK}-accept@example.com`,
      role: "CLIENT_HIRING",
      clientId,
      createdById: authorId,
    });
    await acceptInvitation({ token, fullName: "Принявший Приглашение", password: "длинная фраза для входа" });
    const row = await db.invitation.findFirstOrThrow({ where: { email: `${MARK}-accept@example.com` } });
    expect(row.acceptedAt).not.toBeNull();
    expect(row.token).toBeNull();
    expect(row.tokenEnc).toBeNull();
    expect(await getInvitation(token)).toBeNull();
    await db.user.deleteMany({ where: { email: `${MARK}-accept@example.com` } });
  });

  it("старое приглашение с открытым токеном работает и при показе переезжает под шифр", async () => {
    const legacy = "legacy-open-token-0123456789";
    const created = await db.invitation.create({
      data: {
        organizationId: ORG,
        email: `${MARK}-legacy@example.com`,
        role: "CLIENT_HIRING",
        clientId,
        token: legacy,
        tokenHash: inviteTokenHash(legacy),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: authorId,
      },
    });
    expect(await getInvitation(legacy)).not.toBeNull();

    const team = await listClientTeam(clientId);
    expect(team.invitations.find((i) => i.id === created.id)?.token).toBe(legacy);

    const moved = await db.invitation.findUniqueOrThrow({ where: { id: created.id } });
    expect(moved.token).toBeNull();
    expect(moved.tokenEnc).not.toBeNull();
    expect(moved.tokenEnc).not.toContain(legacy);
    // и ссылка по-прежнему открывается
    expect(await getInvitation(legacy)).not.toBeNull();
  });
});
