/**
 * Приглашения — единственный путь появления пользователя (ТЗ 2.2).
 *
 * Главное здесь — где именно происходит отказ. Занятый адрес должен
 * ловиться при отправке приглашения, а не при его приёме: во втором
 * случае человек узнаёт о проблеме, уже придумав пароль, и починить
 * её сам не может — нужен тот, кто приглашал.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  createInvitation,
  getInvitation,
  InviteError,
} from "@/lib/services/invitations";

const ORG = "org_fattakhov";
const CLIENT = "cl_starfish";
const AUTHOR = "usr_owner";

/** Адрес уже существующего пользователя агентства из seed. */
const TAKEN_AGENCY_EMAIL = "owner@fattakhov.hr";

const MARK = "test-invite";
const free = (suffix: string) => `${MARK}+${suffix}@example.com`;

async function cleanup() {
  await db.invitation.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("занятый адрес", () => {
  it("нельзя пригласить на email существующего пользователя", async () => {
    await expect(
      createInvitation({
        organizationId: ORG,
        email: TAKEN_AGENCY_EMAIL,
        role: "CLIENT_ADMIN",
        clientId: CLIENT,
        createdById: AUTHOR,
      }),
    ).rejects.toThrow(InviteError);
  });

  it("в отказе сказано, кто занял адрес и где", async () => {
    let error: Error | null = null;
    try {
      await createInvitation({
        organizationId: ORG,
        email: TAKEN_AGENCY_EMAIL,
        role: "CLIENT_ADMIN",
        clientId: CLIENT,
        createdById: AUTHOR,
      });
    } catch (e) {
      error = e as Error;
    }

    // Без этого приглашающий не поймёт, почему адрес не подходит:
    // чаще всего это он сам или коллега в другой роли
    expect(error?.message).toContain("уже занят");
    expect(error?.message).toContain("в агентстве");
  });

  it("регистр и пробелы не обходят проверку", async () => {
    await expect(
      createInvitation({
        organizationId: ORG,
        email: `  ${TAKEN_AGENCY_EMAIL.toUpperCase()}  `,
        role: "CLIENT_ADMIN",
        clientId: CLIENT,
        createdById: AUTHOR,
      }),
    ).rejects.toThrow(/уже занят/);
  });
});

describe("повторное приглашение", () => {
  it("второе действующее приглашение на тот же адрес не выдаётся", async () => {
    const email = free("dup");

    await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_ADMIN",
      clientId: CLIENT,
      createdById: AUTHOR,
    });

    // Иначе рассылаются две рабочие ссылки, и вторая ломается
    // при приёме — с той же непонятной ошибкой в самом конце
    await expect(
      createInvitation({
        organizationId: ORG,
        email,
        role: "CLIENT_ADMIN",
        clientId: CLIENT,
        createdById: AUTHOR,
      }),
    ).rejects.toThrow(/действующее приглашение/);
  });

  it("после истечения прежней ссылки пригласить снова можно", async () => {
    const email = free("expired");

    const token = await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_ADMIN",
      clientId: CLIENT,
      createdById: AUTHOR,
    });

    await db.invitation.updateMany({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const fresh = await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_ADMIN",
      clientId: CLIENT,
      createdById: AUTHOR,
    });

    expect(fresh).toBeTruthy();
    expect(await getInvitation(token)).toBeNull();
    expect(await getInvitation(fresh)).not.toBeNull();
  });
});

describe("чужие приглашения не раскрываются (BR-28)", () => {
  const STARFISH_ADMIN = "usr_cl_admin";
  const TECHNOPARK_ADMIN = "usr_cl2_admin";

  async function inviteError(params: Parameters<typeof createInvitation>[0]) {
    return createInvitation(params).then(
      () => null,
      (error: Error) => error,
    );
  }

  it("администратор другой компании не узнаёт, что адрес уже позвали", async () => {
    const email = free("foreign");
    await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_HIRING",
      clientId: CLIENT,
      createdById: STARFISH_ADMIN,
    });

    const error = await inviteError({
      organizationId: ORG,
      email,
      role: "CLIENT_HIRING",
      clientId: "cl_technopark",
      createdById: TECHNOPARK_ADMIN,
    });
    expect(error).toBeInstanceOf(InviteError);
    // Тот же ответ, что на занятый чужой адрес: ни «кто», ни «приглашение»
    expect(error?.message).toContain("адрес недоступен");
    expect(error?.message).not.toMatch(/приглашени/);
  });

  it("своей компании — прямо: приглашение уже ждёт принятия", async () => {
    const email = free("own");
    const params = {
      organizationId: ORG,
      email,
      role: "CLIENT_HIRING" as const,
      clientId: CLIENT,
      createdById: STARFISH_ADMIN,
    };
    await createInvitation(params);

    const error = await inviteError(params);
    expect(error?.message).toMatch(/действующее приглашение/);
    expect(error?.message).toContain("«Ждут принятия»");
  });

  it("агентству — прямо, какой бы компании ни было приглашение", async () => {
    const email = free("agency-sees");
    await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_HIRING",
      clientId: CLIENT,
      createdById: STARFISH_ADMIN,
    });

    const error = await inviteError({
      organizationId: ORG,
      email,
      role: "CLIENT_HIRING",
      clientId: "cl_technopark",
      createdById: AUTHOR,
    });
    expect(error?.message).toMatch(/действующее приглашение/);
  });
});

describe("свободный адрес", () => {
  it("приглашение выдаётся и читается по токену", async () => {
    const email = free("ok");

    const token = await createInvitation({
      organizationId: ORG,
      email,
      role: "CLIENT_ADMIN",
      clientId: CLIENT,
      createdById: AUTHOR,
    });

    const invite = await getInvitation(token);
    expect(invite?.email).toBe(email);
    expect(invite?.role).toBe("CLIENT_ADMIN");
    expect(invite?.clientName).toBeTruthy();
  });
});
