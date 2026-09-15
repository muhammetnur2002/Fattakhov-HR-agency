/**
 * Переходы статуса вакансии — на реальной БД (lib/services/vacancies.ts).
 *
 * transitionVacancy — единственное место, где живут BR-1 (нет договора —
 * нет запуска) и BR-2 (нет даты — нет обещания сроков). Оба правила были
 * без единого автотеста: vacancy-status.test.ts проверяет только граф
 * переходов как чистую функцию, без БД и без самих гейтов. Тесты создают
 * свои вакансии и убирают их за собой; клиенты (cl_starfish — с договором,
 * cl_lead «Камская Логистика» — без) и их договоры берутся из seed
 * как есть, не меняются.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { createVacancyDraft, transitionVacancy } from "@/lib/services/vacancies";
import { VacancyTransitionError } from "@/lib/services/vacancy-status";

const ORG = "org_fattakhov";
const CLIENT_WITH_CONTRACT = "cl_starfish"; // agr_starfish, ACTIVE
const CLIENT_WITHOUT_CONTRACT = "cl_lead"; // «Камская Логистика», без договора — заведён для BR-1

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const PREFIX = "test_vac_";
const createdIds: string[] = [];

async function draft(clientId: string, title: string) {
  const { id } = await createVacancyDraft(recruiter, clientId, {
    title: `${PREFIX}${title}`,
  });
  createdIds.push(id);
  return id;
}

afterAll(async () => {
  if (createdIds.length === 0) return;
  await db.stageTransition.deleteMany({
    where: { application: { vacancyId: { in: createdIds } } },
  });
  await db.application.deleteMany({ where: { vacancyId: { in: createdIds } } });
  await db.pipelineStage.deleteMany({ where: { vacancyId: { in: createdIds } } });
  await db.vacancy.deleteMany({ where: { id: { in: createdIds } } });
});

describe("BR-1: без действующего договора вакансию в работу не запускаем", () => {
  it("SUBMITTED → ACTIVE отклоняется, если у клиента нет договора", async () => {
    const id = await draft(CLIENT_WITHOUT_CONTRACT, "no-contract");
    await transitionVacancy(recruiter, id, "SUBMITTED");

    await expect(transitionVacancy(recruiter, id, "ACTIVE")).rejects.toThrow(
      VacancyTransitionError,
    );
    await expect(transitionVacancy(recruiter, id, "ACTIVE")).rejects.toThrow(
      /договор/,
    );

    const after = await db.vacancy.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("SUBMITTED"); // отказ не должен был сдвинуть статус
  });

  it("SUBMITTED → ACTIVE проходит, когда договор действует", async () => {
    const id = await draft(CLIENT_WITH_CONTRACT, "with-contract");
    await transitionVacancy(recruiter, id, "SUBMITTED");
    await transitionVacancy(recruiter, id, "ACTIVE");

    const after = await db.vacancy.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("ACTIVE");
  });
});

describe("BR-2: обещать сроки, не назвав дату, нельзя", () => {
  it("SUBMITTED → ESTIMATED отклоняется без даты первых кандидатов", async () => {
    const id = await draft(CLIENT_WITH_CONTRACT, "no-date");
    await transitionVacancy(recruiter, id, "SUBMITTED");

    await expect(transitionVacancy(recruiter, id, "ESTIMATED")).rejects.toThrow(
      VacancyTransitionError,
    );

    const after = await db.vacancy.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("SUBMITTED");
  });

  it("SUBMITTED → ESTIMATED проходит с указанной датой", async () => {
    const id = await draft(CLIENT_WITH_CONTRACT, "with-date");
    await transitionVacancy(recruiter, id, "SUBMITTED");

    const in10days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await transitionVacancy(recruiter, id, "ESTIMATED", {
      estimatedFirstCandidatesAt: in10days,
    });

    const after = await db.vacancy.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("ESTIMATED");
  });
});

describe("общие гейты переходов", () => {
  it("переход, которого нет в графе статусов, отклоняется", async () => {
    const id = await draft(CLIENT_WITH_CONTRACT, "bad-transition");
    // DRAFT → ACTIVE напрямую не предусмотрен (только через SUBMITTED)
    await expect(transitionVacancy(recruiter, id, "ACTIVE")).rejects.toThrow(
      VacancyTransitionError,
    );
  });

  it("повторный тот же статус отклоняется явной ошибкой", async () => {
    const id = await draft(CLIENT_WITH_CONTRACT, "same-status");
    await expect(transitionVacancy(recruiter, id, "DRAFT")).rejects.toThrow(
      "Статус уже установлен",
    );
  });
});
