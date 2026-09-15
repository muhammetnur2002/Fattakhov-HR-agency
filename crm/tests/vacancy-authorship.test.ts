/**
 * Кто может завести заявку и на кого.
 *
 * Мастер стал двусторонним: клиент заводит на себя, агентство за клиента.
 * Главное, что здесь проверяется, - что подменённый идентификатор
 * компании в запросе не позволяет пользователю одного клиента завести
 * вакансию на другого. Форма выбора компании есть только у агентства,
 * но полагаться на отсутствие поля в разметке нельзя.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { canDo, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { createVacancyDraft } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";
const MARK = "[тест-авторство]";

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const starfishAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

const starfishViewer: Actor = {
  id: "usr_cl_viewer",
  organizationId: ORG,
  role: "CLIENT_VIEWER",
  clientId: "cl_starfish",
};

async function cleanup() {
  await db.pipelineStage.deleteMany({
    where: { vacancy: { title: { startsWith: MARK } } },
  });
  await db.vacancy.deleteMany({ where: { title: { startsWith: MARK } } });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("право заводить заявку", () => {
  it("агентство может заводить на любого клиента", () => {
    expect(canDo(owner, "vacancy.create", { clientId: "cl_starfish" })).toBe(true);
    expect(canDo(owner, "vacancy.create", { clientId: "cl_technopark" })).toBe(true);
    expect(canDo(recruiter, "vacancy.create", { clientId: "cl_starfish" })).toBe(true);
  });

  it("администратор клиента только на свою компанию", () => {
    expect(canDo(starfishAdmin, "vacancy.create", { clientId: "cl_starfish" })).toBe(true);
    // Вот это и есть главная проверка: подменённый идентификатор в запросе
    expect(canDo(starfishAdmin, "vacancy.create", { clientId: "cl_technopark" })).toBe(false);
  });

  it("наблюдатель не заводит заявок вовсе", () => {
    expect(canDo(starfishViewer, "vacancy.create", { clientId: "cl_starfish" })).toBe(false);
  });
});

describe("черновик, заведённый агентством", () => {
  it("принадлежит клиенту, а автором записан сотрудник агентства", async () => {
    const created = await createVacancyDraft(owner, "cl_starfish", {
      title: `${MARK} Заведена агентством`,
    });

    const vacancy = await db.vacancy.findFirstOrThrow({
      where: { id: created.id },
      select: { clientId: true, createdById: true, status: true, number: true },
    });

    // Заявка принадлежит компании, а не тому, кто её набрал:
    // иначе клиент не увидит её у себя в кабинете
    expect(vacancy.clientId).toBe("cl_starfish");
    // Автор нужен, чтобы было видно, что заявку завели за клиента
    expect(vacancy.createdById).toBe(owner.id);
    expect(vacancy.status).toBe("DRAFT");
    expect(vacancy.number).toBeGreaterThan(0);
  });

  it("нумерация сквозная и не зависит от того, кто завёл", async () => {
    const first = await createVacancyDraft(owner, "cl_starfish", {
      title: `${MARK} Первая`,
    });
    const second = await createVacancyDraft(starfishAdmin, "cl_starfish", {
      title: `${MARK} Вторая`,
    });

    const numbers = await db.vacancy.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { number: true },
      orderBy: { number: "asc" },
    });

    expect(numbers[1].number).toBe(numbers[0].number + 1);
  });

  it("клиент видит заявку, заведённую за него", async () => {
    const created = await createVacancyDraft(owner, "cl_starfish", {
      title: `${MARK} Видна клиенту`,
    });

    const { visibleVacanciesFilter } = await import("@/lib/access");
    const visible = await db.vacancy.findFirst({
      where: { id: created.id, ...visibleVacanciesFilter(starfishAdmin) },
      select: { id: true },
    });

    expect(visible).not.toBeNull();
  });

  it("чужой клиент её не видит", async () => {
    const created = await createVacancyDraft(owner, "cl_starfish", {
      title: `${MARK} Чужому не видна`,
    });

    const technopark: Actor = {
      id: "usr_cl2_admin",
      organizationId: ORG,
      role: "CLIENT_ADMIN",
      clientId: "cl_technopark",
    };

    const { visibleVacanciesFilter } = await import("@/lib/access");
    const visible = await db.vacancy.findFirst({
      where: { id: created.id, ...visibleVacanciesFilter(technopark) },
      select: { id: true },
    });

    expect(visible).toBeNull();
  });
});
