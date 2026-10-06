/**
 * Подтверждение почты для вошедших по телефону.
 *
 * Дыра, которую это закрывает (CRM агентства, 24.09.2026): анкета
 * записывала названную почту сразу в User.email. Опечатка — и посторонний
 * получал уведомления о кандидатах, а через «Забыли пароль» задавал пароль
 * и входил в кабинет: сброс ищет человека по email. Теперь адрес ждёт
 * в pendingEmail, пока не откроют ссылку из письма на него.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { requestPasswordReset } from "@/lib/services/passwords";
import {
  confirmEmail,
  EmailConfirmError,
  emailConfirmToken,
  readEmailConfirmToken,
  requestEmailConfirmation,
} from "@/lib/services/email-confirmation";
import { resolveQuickSignIn } from "@/lib/services/quick-registration";

const PHONE = "+79990007711";
const MARK = "test-email-confirm";

async function cleanup() {
  const users = await db.user.findMany({
    where: { phoneVerified: PHONE },
    select: { id: true, clientId: true },
  });
  const userIds = users.map((u) => u.id);
  const clientIds = users.flatMap((u) => (u.clientId ? [u.clientId] : []));
  await db.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
  await db.activityLog.deleteMany({ where: { entityId: { in: userIds } } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.lead.deleteMany({ where: { clientId: { in: clientIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.client.deleteMany({ where: { id: { in: clientIds }, selfRegisteredAt: { not: null } } });
}

async function quickUser() {
  return resolveQuickSignIn(
    { kind: "phone", phone: PHONE },
    { consent: true, secondFactorCode: "" },
  );
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("ссылка подтверждения", () => {
  it("читается обратно, пока не истекли сутки", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const token = emailConfirmToken("usr_1", "anna@example.com", now);

    expect(readEmailConfirmToken(token, now)).toEqual({ userId: "usr_1", email: "anna@example.com" });
    expect(readEmailConfirmToken(token, new Date("2026-09-25T12:00:01Z"))).toBeNull();
  });

  it("подменённый адрес или испорченная подпись — не ссылка", () => {
    const token = emailConfirmToken("usr_1", "anna@example.com");
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "usr_1", e: "evil@example.com", x: 9_999_999_999 }),
    ).toString("base64url");

    expect(readEmailConfirmToken(`${forged}.${signature}`)).toBeNull();
    expect(readEmailConfirmToken(`${token}x`)).toBeNull();
    expect(readEmailConfirmToken("мусор")).toBeNull();
  });
});

describe("подтверждение почты", () => {
  it("названный адрес ждёт ссылки и рабочим не становится", async () => {
    const user = await quickUser();
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await requestEmailConfirmation({
        userId: user.id,
        organizationId: user.organizationId,
        email: ` ${MARK}@Example.com `,
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: `${MARK}@example.com`,
          text: expect.stringContaining("/confirm-email/"),
          // Фирменное письмо той же оболочкой, что приглашения и сброс пароля
          html: expect.stringContaining("Подтвердить почту"),
        }),
      );
    } finally {
      send.mockRestore();
    }

    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, pendingEmail: true },
    });
    expect(row.email).toMatch(/@users\.invalid$/);
    expect(row.pendingEmail).toBe(`${MARK}@example.com`);
  });

  it("пока адрес не подтверждён, «Забыли пароль» по нему ничего не шлёт", async () => {
    const user = await quickUser();
    await requestEmailConfirmation({
      userId: user.id,
      organizationId: user.organizationId,
      email: `${MARK}@example.com`,
    });

    await requestPasswordReset({ email: `${MARK}@example.com` });
    expect(await db.passwordReset.count({ where: { userId: user.id } })).toBe(0);
  });

  it("по ссылке адрес становится рабочим, и это видно в журнале", async () => {
    const user = await quickUser();
    const email = `${MARK}@example.com`;
    await requestEmailConfirmation({ userId: user.id, organizationId: user.organizationId, email });

    await expect(confirmEmail(emailConfirmToken(user.id, email))).resolves.toEqual({ email });

    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, pendingEmail: true },
    });
    expect(row).toEqual({ email, pendingEmail: null });
    expect(
      await db.activityLog.count({ where: { entityId: user.id, action: "email_confirmed" } }),
    ).toBe(1);

    // Второй переход по той же ссылке — не ошибка
    await expect(confirmEmail(emailConfirmToken(user.id, email))).resolves.toEqual({ email });
  });

  it("ссылка на прежний адрес не действует, если назвали другой", async () => {
    const user = await quickUser();
    const first = `${MARK}-1@example.com`;
    await requestEmailConfirmation({ userId: user.id, organizationId: user.organizationId, email: first });
    await requestEmailConfirmation({
      userId: user.id,
      organizationId: user.organizationId,
      email: `${MARK}-2@example.com`,
    });

    await expect(confirmEmail(emailConfirmToken(user.id, first))).rejects.toThrow(/указали другой адрес/);
  });

  it("чужой рабочий адрес не подключить", async () => {
    const user = await quickUser();
    await expect(
      requestEmailConfirmation({
        userId: user.id,
        organizationId: user.organizationId,
        email: "owner@fattakhov.hr",
      }),
    ).rejects.toThrow(EmailConfirmError);
  });

  it("у кого почта уже рабочая, этим путём её не сменить", async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { email: "owner@fattakhov.hr" },
      select: { id: true, organizationId: true },
    });
    await expect(
      requestEmailConfirmation({
        userId: owner.id,
        organizationId: owner.organizationId,
        email: `${MARK}@example.com`,
      }),
    ).rejects.toThrow(/уже подключена/);
  });
});
