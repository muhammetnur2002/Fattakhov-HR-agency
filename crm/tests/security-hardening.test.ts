/**
 * Защита от подмены и перебора: перебор пароля и кода при входе, служебные адреса
 * платформы студентов и чужие комментарии.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Пакет-маркер серверного кода в тестовой среде не установлен
vi.mock("server-only", () => ({}));

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
  reserveSecondFactorAttempt,
} from "@/lib/security/login-throttle";
import { createComment, markCommentsRead } from "@/lib/services/comments";

const ORG = "org_fattakhov";
const MARK = "test_sec_";
const EMAIL = `${MARK}user@example.com`;
const USER_ID = `${MARK}user-id`;

async function cleanup() {
  await db.authFailure.deleteMany({ where: { key: { contains: MARK } } });
  await db.comment.deleteMany({ where: { body: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("перебор при входе", () => {
  it("после десяти неудач по одной учётке вход закрыт, успех счётчик сбрасывает", async () => {
    expect(await isLoginBlocked(EMAIL)).toBe(false);
    for (let i = 0; i < 10; i++) await recordLoginFailure(EMAIL);
    expect(await isLoginBlocked(EMAIL)).toBe(true);
    // Регистр и пробелы в адресе счётчик не обходят
    expect(await isLoginBlocked(`  ${EMAIL.toUpperCase()} `)).toBe(true);
    // Другая учётка не задета
    expect(await isLoginBlocked(`${MARK}other@example.com`)).toBe(false);

    await clearLoginFailures(EMAIL, USER_ID);
    expect(await isLoginBlocked(EMAIL)).toBe(false);
  });

  it("код второго фактора закрывается после пяти попыток, успех их сбрасывает", async () => {
    for (let i = 0; i < 5; i++) expect(await reserveSecondFactorAttempt(USER_ID)).toBe(true);
    // Шестая попытка не проходит: код при этом не проверяется вовсе
    expect(await reserveSecondFactorAttempt(USER_ID)).toBe(false);
    // Другой пользователь не задет
    expect(await reserveSecondFactorAttempt(`${USER_ID}-other`)).toBe(true);

    await clearLoginFailures(EMAIL, USER_ID);
    expect(await reserveSecondFactorAttempt(USER_ID)).toBe(true);
  });
});

describe("служебные адреса платформы студентов", () => {
  it("идентификатор вакансии не выводит запрос за пределы своего маршрута", async () => {
    const { updateEmployerVacancy, actOnEmployerVacancy, resolveCrmLinkRequest, fetchEmployerVacancy } = await import(
      "@/lib/students-service"
    );
    const fields = {} as Parameters<typeof updateEmployerVacancy>[1];
    for (const id of ["../../crm-links/x/resolve", "..", "%2e%2e", "a/b", "a?b=1"]) {
      await expect(updateEmployerVacancy(id, fields)).rejects.toThrow(/Недопустим/);
      await expect(actOnEmployerVacancy(id, { crmClientId: "c", actor: "a", action: "close" })).rejects.toThrow(
        /Недопустим/,
      );
      await expect(resolveCrmLinkRequest(id, "c")).rejects.toThrow(/Недопустим/);
      expect(await fetchEmployerVacancy("c", id)).toBeNull();
    }
  });
});

describe("комментарии", () => {
  const clientAdmin: Actor = { id: "usr_cl_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_starfish" };
  const otherAdmin: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

  it("вакансия комментария берётся из отклика, а не из формы", async () => {
    const foreign = await db.vacancy.findFirst({ where: { clientId: "cl_technopark" }, select: { id: true } });
    expect(foreign).not.toBeNull();

    const { id } = await createComment(clientAdmin, {
      applicationId: "app_13",
      vacancyId: foreign?.id,
      body: `${MARK}подмена вакансии`,
      visibility: "SHARED",
    });
    const stored = await db.comment.findUnique({ where: { id }, select: { vacancyId: true } });
    expect(stored?.vacancyId).toBe("vac_1");
  });

  it("отметить прочитанным чужой комментарий нельзя", async () => {
    const { id } = await createComment(clientAdmin, {
      applicationId: "app_13",
      body: `${MARK}личное`,
      visibility: "SHARED",
    });
    await markCommentsRead(otherAdmin, [id]);
    expect(await db.commentRead.count({ where: { commentId: id, userId: otherAdmin.id } })).toBe(0);
  });
});
