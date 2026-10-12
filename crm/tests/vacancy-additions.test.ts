/**
 * Доработки страницы вакансии: подбор из базы пачкой и правка брифа агентством.
 *
 * Проверяется на реальной базе: кто попадает в выдачу и с какими пометками,
 * на какие этапы можно посадить, что пропускается и что отклоняется, как
 * правка брифа стирает поля, пишет журнал и сообщает клиенту.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const notifyMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/notifications/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/notify")>()),
  notify: notifyMock,
}));

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { createPipelineStages } from "@/lib/services/vacancies";
import { ApplicationError } from "@/lib/services/applications";
import {
  describeChangedFields,
  editBriefAsAgency,
  lastBriefEdit,
  VacancyBriefError,
} from "@/lib/services/vacancy-brief-edit";
import { addManyToVacancy, MAX_PICK, searchForVacancy } from "@/lib/services/vacancy-picker";
import { vacancyBriefSchema } from "@/lib/validation/vacancy";

const ORG = "org_fattakhov";
const MARK = "test_vadd_";
const NUMBER = 91000 + Math.floor(Math.random() * 900);

const recruiter: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const client: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

let vacancyId = "";
let otherVacancyId = "";
let stages: { id: string; code: string; visibleToClient: boolean }[] = [];
const ids = { kazan: "", moscow: "", waiting: "", erased: "" };

async function cleanup() {
  const vacancies = await db.vacancy.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } });
  const vids = vacancies.map((v) => v.id);
  const candidates = await db.candidate.findMany({ where: { id: { startsWith: MARK } }, select: { id: true } });
  const cids = candidates.map((c) => c.id);
  const apps = await db.application.findMany({
    where: { OR: [{ vacancyId: { in: vids } }, { candidateId: { in: cids } }] },
    select: { id: true },
  });
  const aids = apps.map((a) => a.id);
  await db.stageTransition.deleteMany({ where: { applicationId: { in: aids } } });
  await db.application.deleteMany({ where: { id: { in: aids } } });
  await db.activityLog.deleteMany({ where: { entityType: "Vacancy", entityId: { in: vids } } });
  await db.pipelineStage.deleteMany({ where: { vacancyId: { in: vids } } });
  await db.vacancy.deleteMany({ where: { id: { in: vids } } });
  await db.candidate.deleteMany({ where: { id: { in: cids } } });
}

async function makeCandidate(key: keyof typeof ids, data: Record<string, unknown>) {
  const row = await db.candidate.create({
    data: { id: `${MARK}${key}`, organizationId: ORG, createdById: "usr_owner", ...data } as never,
    select: { id: true },
  });
  ids[key] = row.id;
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

beforeEach(async () => {
  await cleanup();
  notifyMock.mockClear();

  const vacancy = await db.vacancy.create({
    data: {
      organizationId: ORG,
      clientId: "cl_technopark",
      number: NUMBER,
      title: `${MARK}вакансия`,
      status: "ACTIVE",
      createdById: "usr_owner",
      department: "Бухгалтерия",
      city: "Казань",
      headcount: 1,
    },
    select: { id: true },
  });
  vacancyId = vacancy.id;
  await createPipelineStages(vacancyId);
  stages = await db.pipelineStage.findMany({
    where: { vacancyId },
    orderBy: { order: "asc" },
    select: { id: true, code: true, visibleToClient: true },
  });

  const other = await db.vacancy.create({
    data: {
      organizationId: ORG,
      clientId: "cl_technopark",
      number: NUMBER + 1000,
      title: `${MARK}другая вакансия`,
      status: "ACTIVE",
      createdById: "usr_owner",
    },
    select: { id: true },
  });
  otherVacancyId = other.id;
  await createPipelineStages(otherVacancyId);

  await makeCandidate("kazan", { fullName: `${MARK}Анна Казань`, city: "Казань", salaryExpectation: 90000, currentPosition: "Бухгалтер" });
  await makeCandidate("moscow", { fullName: `${MARK}Борис Москва`, city: "Москва", salaryExpectation: 150000, currentPosition: "Бухгалтер" });
  await makeCandidate("waiting", { fullName: `${MARK}Вера Ждёт`, city: "Казань", salaryExpectation: 80000, currentPosition: "Бухгалтер" });
  await makeCandidate("erased", {
    fullName: `${MARK}Глеб Удалён`,
    city: "Казань",
    currentPosition: "Бухгалтер",
    erasureState: "BLOCKED_FOR_ERASURE",
  });

  // Вера представлена клиенту по другой вакансии и ждёт его решения
  const otherStages = await db.pipelineStage.findMany({ where: { vacancyId: otherVacancyId }, orderBy: { order: "asc" } });
  await db.application.create({
    data: {
      organizationId: ORG,
      vacancyId: otherVacancyId,
      candidateId: ids.waiting,
      stageId: otherStages[2].id,
      ownerId: "usr_rec1",
      presentedAt: new Date(),
    },
  });
});

describe("поиск по базе внутри вакансии", () => {
  it("находит по условиям и ставит пометки", async () => {
    const all = await searchForVacancy(recruiter, vacancyId, { query: MARK });
    const names = all.map((c) => c.fullName.replace(MARK, ""));
    expect(names).toEqual(expect.arrayContaining(["Анна Казань", "Борис Москва", "Вера Ждёт"]));

    const vera = all.find((c) => c.id === ids.waiting)!;
    expect(vera.awaitingClient).toBe(true);
    expect(vera.otherVacancies).toBe(1);
    expect(vera.inThisVacancy).toBe(false);
  });

  it("не показывает ждущих удаления и обезличенных", async () => {
    const all = await searchForVacancy(recruiter, vacancyId, { query: MARK });
    expect(all.map((c) => c.id)).not.toContain(ids.erased);
  });

  it("фильтрует по городу и потолку зарплаты", async () => {
    const kazan = await searchForVacancy(recruiter, vacancyId, { query: MARK, city: "Казань" });
    expect(kazan.map((c) => c.id).sort()).toEqual([ids.kazan, ids.waiting].sort());

    const cheap = await searchForVacancy(recruiter, vacancyId, { query: MARK, salaryTo: 85000 });
    expect(cheap.map((c) => c.id)).toEqual([ids.waiting]);
  });

  it("помечает тех, кто уже в этой вакансии", async () => {
    await addManyToVacancy(recruiter, vacancyId, [ids.kazan]);
    const all = await searchForVacancy(recruiter, vacancyId, { query: MARK });
    expect(all.find((c) => c.id === ids.kazan)!.inThisVacancy).toBe(true);
  });

  it("клиенту поиск по базе недоступен", async () => {
    await expect(searchForVacancy(client, vacancyId, { query: MARK })).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("посадка пачкой", () => {
  it("по умолчанию на первый внутренний этап, история пишется", async () => {
    const result = await addManyToVacancy(recruiter, vacancyId, [ids.kazan, ids.moscow]);
    expect(result).toEqual({ added: 2, skipped: [] });

    const apps = await db.application.findMany({ where: { vacancyId }, include: { transitions: true } as never });
    expect(apps).toHaveLength(2);
    for (const a of apps) {
      expect(a.stageId).toBe(stages[0].id);
      expect((a as unknown as { transitions: { comment: string }[] }).transitions[0].comment).toContain("подбор из базы");
    }
  });

  it("на выбранный внутренний этап (скрининг)", async () => {
    const screening = stages.find((s) => s.code === "SCREENING")!;
    await addManyToVacancy(recruiter, vacancyId, [ids.kazan], screening.id);
    const app = await db.application.findFirstOrThrow({ where: { vacancyId, candidateId: ids.kazan } });
    expect(app.stageId).toBe(screening.id);
  });

  it("на этап, видимый клиенту, посадить нельзя: он идёт через представление", async () => {
    const presented = stages.find((s) => s.code === "PRESENTED")!;
    await expect(addManyToVacancy(recruiter, vacancyId, [ids.kazan], presented.id)).rejects.toBeInstanceOf(ApplicationError);
    expect(await db.application.count({ where: { vacancyId } })).toBe(0);
  });

  it("чужой этап (от другой вакансии) не принимается", async () => {
    const foreign = await db.pipelineStage.findFirstOrThrow({ where: { vacancyId: otherVacancyId, code: "LONGLIST" } });
    await expect(addManyToVacancy(recruiter, vacancyId, [ids.kazan], foreign.id)).rejects.toBeInstanceOf(ApplicationError);
  });

  it("уже сидящих и несуществующих пропускает, остальных сажает", async () => {
    await addManyToVacancy(recruiter, vacancyId, [ids.kazan]);
    const result = await addManyToVacancy(recruiter, vacancyId, [ids.kazan, ids.moscow, "нет-такого", ids.erased]);
    expect(result.added).toBe(1);
    expect(result.skipped.map((s) => s.candidateId).sort()).toEqual([ids.kazan, "нет-такого", ids.erased].sort());
    expect(await db.application.count({ where: { vacancyId } })).toBe(2);
  });

  it("повтор того же списка ничего не создаёт", async () => {
    await addManyToVacancy(recruiter, vacancyId, [ids.kazan, ids.moscow]);
    const again = await addManyToVacancy(recruiter, vacancyId, [ids.kazan, ids.moscow]);
    expect(again.added).toBe(0);
    expect(await db.application.count({ where: { vacancyId } })).toBe(2);
  });

  it("пустой список, слишком большой список и клиент отклоняются", async () => {
    await expect(addManyToVacancy(recruiter, vacancyId, [])).rejects.toBeInstanceOf(ApplicationError);
    const many = Array.from({ length: MAX_PICK + 1 }, (_, i) => `${MARK}x${i}`);
    await expect(addManyToVacancy(recruiter, vacancyId, many)).rejects.toBeInstanceOf(ApplicationError);
    await expect(addManyToVacancy(client, vacancyId, [ids.kazan])).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("у вакансии без воронки сажать некуда", async () => {
    await db.stageTransition.deleteMany({ where: { application: { vacancyId: otherVacancyId } } });
    await db.application.deleteMany({ where: { vacancyId: otherVacancyId } });
    await db.pipelineStage.deleteMany({ where: { vacancyId: otherVacancyId } });
    await expect(addManyToVacancy(recruiter, otherVacancyId, [ids.kazan])).rejects.toThrow(/не запущена/);
  });
});

describe("правка брифа агентством", () => {
  const base = {
    title: `${MARK}вакансия`,
    headcount: 1,
    urgency: "NORMAL",
    salaryGross: true,
    department: "Бухгалтерия",
    city: "Казань",
  };
  const parse = (extra: Record<string, unknown>) => vacancyBriefSchema.parse({ ...base, ...extra });

  it("меняет поля, пишет журнал и сообщает клиенту", async () => {
    const result = await editBriefAsAgency(recruiter, vacancyId, parse({ requirements: "Опыт 1С от 3 лет", city: "Москва" }));
    expect(result.changed.sort()).toEqual(["city", "requirements"]);

    const row = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
    expect(row.requirements).toBe("Опыт 1С от 3 лет");
    expect(row.city).toBe("Москва");

    const log = await lastBriefEdit(vacancyId);
    expect(log?.by).toBeTruthy();

    expect(notifyMock).toHaveBeenCalledTimes(1);
    const call = notifyMock.mock.calls[0] as unknown as [{ event: string; body: string; userIds: string[] }];
    expect(call[0].event).toBe("VACANCY_BRIEF_CHANGED");
    expect(call[0].body.toLowerCase()).toContain("требования");
    expect(call[0].userIds).not.toContain("usr_rec1");
  });

  it("пустое поле стирает значение", async () => {
    await editBriefAsAgency(recruiter, vacancyId, parse({}));
    const row = await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
    expect(row.department).toBe("Бухгалтерия");

    await editBriefAsAgency(recruiter, vacancyId, parse({ department: "" }));
    expect((await db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } })).department).toBeNull();
  });

  it("без изменений ничего не пишет и никого не беспокоит", async () => {
    const result = await editBriefAsAgency(recruiter, vacancyId, parse({}));
    expect(result.changed).toEqual([]);
    expect(await lastBriefEdit(vacancyId)).toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("заказчиком может быть только человек этого клиента", async () => {
    const stranger = await db.user.findFirstOrThrow({ where: { clientId: "cl_starfish", isActive: true }, select: { id: true } });
    await expect(
      editBriefAsAgency(recruiter, vacancyId, parse({ hiringManagerId: stranger.id })),
    ).rejects.toBeInstanceOf(VacancyBriefError);
  });

  it("закрытую вакансию править нельзя, чужую организацию не видно", async () => {
    await db.vacancy.update({ where: { id: vacancyId }, data: { status: "CLOSED_SUCCESS" } });
    await expect(editBriefAsAgency(recruiter, vacancyId, parse({ city: "Уфа" }))).rejects.toBeInstanceOf(VacancyBriefError);
    await expect(
      editBriefAsAgency({ ...recruiter, organizationId: "org_other" }, vacancyId, parse({ city: "Уфа" })),
    ).rejects.toBeInstanceOf(VacancyBriefError);
  });

  it("клиент правит бриф только своей дорогой: сервис агентства ему закрыт", async () => {
    await expect(editBriefAsAgency(client, vacancyId, parse({ city: "Уфа" }))).rejects.toThrow();
  });

  it("при черновике клиента уведомление не уходит", async () => {
    await db.vacancy.update({ where: { id: vacancyId }, data: { status: "DRAFT" } });
    await editBriefAsAgency(recruiter, vacancyId, parse({ city: "Уфа" }));
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("описание изменённых полей: вилка одним пунктом", () => {
    expect(describeChangedFields(["salaryFrom", "salaryTo", "city"])).toEqual(["Зарплатная вилка", "Город"]);
  });
});
