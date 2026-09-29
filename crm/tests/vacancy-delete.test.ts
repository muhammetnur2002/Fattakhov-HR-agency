/**
 * Удаление закрытых вакансий (lib/services/vacancies.ts, право vacancy.delete).
 *
 * Правило одно: убрать из списка можно только закрытую вакансию, любым способом.
 * Живая заявка, по которой агентство работает или обещало сроки, удаляться не должна —
 * ни кнопкой, ни «очисткой закрытых» с подсунутым чужим id.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canDo, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { createVacancyDraft, deleteClosedVacancy, isDeletableVacancyStatus } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";
const CLIENT = "cl_starfish";
const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null, grants: [] };

const createdIds: string[] = [];

async function vacancy(title: string, status: "DRAFT" | "ACTIVE" | "CLOSED_SUCCESS" | "CLOSED_CANCELLED" | "CLOSED_FAILED") {
  const { id } = await createVacancyDraft(owner, CLIENT, { title: `test_del_${title}` });
  createdIds.push(id);
  await db.vacancy.update({ where: { id }, data: { status } });
  return id;
}

afterAll(async () => {
  await db.pipelineStage.deleteMany({ where: { vacancyId: { in: createdIds } } });
  await db.vacancy.deleteMany({ where: { id: { in: createdIds } } });
  await db.$disconnect();
});

describe("удаление закрытых вакансий", () => {
  it("закрытые любым способом удаляются и пропадают из выборок", async () => {
    for (const status of ["CLOSED_SUCCESS", "CLOSED_CANCELLED", "CLOSED_FAILED"] as const) {
      const id = await vacancy(status, status);
      expect(await deleteClosedVacancy(owner, id)).toBe("deleted");
      const row = await db.vacancy.findUnique({ where: { id }, select: { deletedAt: true } });
      expect(row?.deletedAt).not.toBeNull();
    }
  });

  it("живая и черновая вакансии не удаляются", async () => {
    const active = await vacancy("active", "ACTIVE");
    const draft = await vacancy("draft", "DRAFT");
    expect(await deleteClosedVacancy(owner, active)).toBe("not_closed");
    expect(await deleteClosedVacancy(owner, draft)).toBe("not_closed");
    const rows = await db.vacancy.findMany({ where: { id: { in: [active, draft] } }, select: { deletedAt: true } });
    expect(rows.every((r) => r.deletedAt === null)).toBe(true);
  });

  it("чужой или несуществующий id — «не найдена»", async () => {
    expect(await deleteClosedVacancy(owner, "does-not-exist")).toBe("not_found");
    const id = await vacancy("foreign", "CLOSED_CANCELLED");
    expect(await deleteClosedVacancy({ ...owner, organizationId: "other_org" }, id)).toBe("not_found");
  });

  it("статусы, которые считаются закрытыми", () => {
    expect(isDeletableVacancyStatus("CLOSED_SUCCESS")).toBe(true);
    expect(isDeletableVacancyStatus("ON_HOLD")).toBe(false);
    expect(isDeletableVacancyStatus("SUBMITTED")).toBe(false);
  });
});

describe("кто может удалять", () => {
  it("руководство и аккаунт-менеджер — да, рекрутёр и наблюдатель — нет", () => {
    const actor = (role: Actor["role"], clientId: string | null = null): Actor => ({
      id: "u",
      organizationId: ORG,
      role,
      clientId,
      grants: [],
    });
    expect(canDo(actor("OWNER"), "vacancy.delete")).toBe(true);
    expect(canDo(actor("HEAD"), "vacancy.delete")).toBe(true);
    expect(canDo(actor("ACCOUNT"), "vacancy.delete")).toBe(true);
    expect(canDo(actor("RECRUITER"), "vacancy.delete")).toBe(false);
    expect(canDo(actor("CLIENT_VIEWER", CLIENT), "vacancy.delete", { clientId: CLIENT })).toBe(false);
    expect(canDo(actor("CLIENT_HIRING", CLIENT), "vacancy.delete", { clientId: CLIENT })).toBe(false);
  });

  it("администратор клиента — только свои", () => {
    const admin: Actor = { id: "u", organizationId: ORG, role: "CLIENT_ADMIN", clientId: CLIENT, grants: [] };
    expect(canDo(admin, "vacancy.delete", { clientId: CLIENT })).toBe(true);
    expect(canDo(admin, "vacancy.delete", { clientId: "cl_lead" })).toBe(false);
  });
});
