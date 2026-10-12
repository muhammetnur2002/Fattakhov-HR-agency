/**
 * Аналитика по сотрудникам: кто кого видит, цифры против прямого подсчёта,
 * бейдж «Финал» и задания в показателях.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  employeeVacancies,
  getEmployeeStats,
  listEmployeeStats,
} from "@/lib/services/analytics/employees";
import { defaultPeriod } from "@/lib/services/analytics/queries";

const ORG = "org_fattakhov";
const MARK = "test_empan_";

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const head: Actor = { id: "usr_head", organizationId: ORG, role: "HEAD", clientId: null };
const rec1: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const client: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

const period = defaultPeriod(90);

async function cleanup() {
  await db.calendarTask.deleteMany({ where: { title: { startsWith: MARK } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("кто кого видит", () => {
  it("владелец и руководитель видят всех сотрудников", async () => {
    for (const actor of [owner, head]) {
      const list = await listEmployeeStats(actor, period);
      const ids = list.map((e) => e.id);
      expect(ids).toContain("usr_rec1");
      expect(ids).toContain("usr_rec2");
    }
  });

  it("в списке нет владельца, клиентов и выключенных", async () => {
    const list = await listEmployeeStats(owner, period);
    const roles = new Set(list.map((e) => e.role));
    expect([...roles].every((r) => ["HEAD", "RECRUITER", "ACCOUNT"].includes(r))).toBe(true);
    const inactive = await db.user.findMany({
      where: { organizationId: ORG, isActive: false },
      select: { id: true },
    });
    for (const u of inactive) expect(list.map((e) => e.id)).not.toContain(u.id);
  });

  it("рекрутёр видит в списке только себя", async () => {
    const list = await listEmployeeStats(rec1, period);
    expect(list.map((e) => e.id)).toEqual(["usr_rec1"]);
  });

  it("рекрутёр открывает свою страницу, чужую нет", async () => {
    const own = await getEmployeeStats(rec1, "usr_rec1", period);
    expect(own?.id).toBe("usr_rec1");
    await expect(getEmployeeStats(rec1, "usr_rec2", period)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(employeeVacancies(rec1, "usr_rec2")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  it("клиент не получает ничего", async () => {
    await expect(listEmployeeStats(client, period)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(getEmployeeStats(client, "usr_rec1", period)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  it("несуществующий или чужой сотрудник — null", async () => {
    expect(await getEmployeeStats(owner, "usr_no_such", period)).toBeNull();
    // клиентский пользователь не сотрудник агентства
    expect(await getEmployeeStats(owner, "usr_cl2_admin", period)).toBeNull();
  });
});

describe("цифры сходятся с прямым подсчётом", () => {
  it("кандидаты в работе, вакансии и представления", async () => {
    const stats = await getEmployeeStats(owner, "usr_rec1", period);
    expect(stats).not.toBeNull();

    const [inWork, vacancies, presented] = await Promise.all([
      db.application.count({
        where: { organizationId: ORG, ownerId: "usr_rec1", outcome: "IN_PROGRESS" },
      }),
      db.vacancy.count({
        where: { organizationId: ORG, status: "ACTIVE", recruiterIds: { has: "usr_rec1" } },
      }),
      db.application.count({
        where: {
          organizationId: ORG,
          presentedById: "usr_rec1",
          presentedAt: { gte: period.from, lte: period.to },
        },
      }),
    ]);

    expect(stats!.activeCandidates).toBe(inWork);
    expect(stats!.activeVacancies).toBe(vacancies);
    expect(stats!.presented).toBe(presented);
  });

  it("список и страница одного сотрудника дают одни и те же цифры", async () => {
    const list = await listEmployeeStats(owner, period);
    const row = list.find((e) => e.id === "usr_rec1")!;
    const one = await getEmployeeStats(owner, "usr_rec1", period);
    expect(one).toEqual(row);
  });
});

describe("бейдж «Финал»", () => {
  it("финалисты сотрудника — это его кандидаты на этапе FINAL в работе", async () => {
    const finals = await db.application.findMany({
      where: { organizationId: ORG, outcome: "IN_PROGRESS", stage: { code: "FINAL" } },
      select: { id: true, ownerId: true },
    });
    expect(finals.length).toBeGreaterThan(0);

    const list = await listEmployeeStats(owner, period);
    for (const e of list) {
      const expected = finals.filter((f) => f.ownerId === e.id).map((f) => f.id).sort();
      expect(e.finalists.map((f) => f.applicationId).sort()).toEqual(expected);
    }
  });

  it("отказанный на финале не считается финалистом", async () => {
    const finals = await db.application.findMany({
      where: { organizationId: ORG, outcome: { not: "IN_PROGRESS" }, stage: { code: "FINAL" } },
      select: { id: true },
    });
    const list = await listEmployeeStats(owner, period);
    const shown = new Set(list.flatMap((e) => e.finalists.map((f) => f.applicationId)));
    for (const f of finals) expect(shown.has(f.id)).toBe(false);
  });
});

describe("задания в показателях сотрудника", () => {
  it("открытые, просроченные и выполненные считаются отдельно", async () => {
    const base = await getEmployeeStats(owner, "usr_rec2", period);
    const now = Date.now();

    await db.calendarTask.createMany({
      data: [
        {
          organizationId: ORG, title: `${MARK}open`, dueAt: new Date(now + 3_600_000),
          assigneeId: "usr_rec2", createdById: "usr_owner",
        },
        {
          organizationId: ORG, title: `${MARK}late`, dueAt: new Date(now - 3_600_000),
          assigneeId: "usr_rec2", createdById: "usr_owner",
        },
        {
          organizationId: ORG, title: `${MARK}done`, dueAt: new Date(now - 7_200_000),
          assigneeId: "usr_rec2", createdById: "usr_owner",
          completedAt: new Date(now - 3_600_000), completedById: "usr_rec2",
        },
      ],
    });

    const after = await getEmployeeStats(owner, "usr_rec2", period);
    expect(after!.tasksOpen - base!.tasksOpen).toBe(2);
    expect(after!.tasksOverdue - base!.tasksOverdue).toBe(1);
    expect(after!.tasksDone - base!.tasksDone).toBe(1);
  });
});
