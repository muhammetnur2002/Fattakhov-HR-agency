/**
 * Доработки по кандидатам: рабочий статус, правка профиля, комментарии под
 * кандидатом, файлы.
 *
 * Отдельно проверены правила, которые легко сломать незаметно: стирание поля
 * очисткой, режим сорсинг-лида (юрист запретил хранить о нём что-либо кроме
 * имени и контактов), видимость комментариев работодателю только в рамках
 * вакансии и то, что исходное резюме клиенту не передаётся.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const notifyMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/notifications/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/notify")>()),
  notify: notifyMock,
}));

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { CandidateEditError, describeChangedProfileFields, editCandidateProfile } from "@/lib/services/candidate-edit";
import {
  CandidateFileError,
  deleteCandidateFile,
  fileVisibility,
  parseCandidateFileKind,
} from "@/lib/services/candidate-files";
import {
  CandidateNoteError,
  createCandidateComment,
  listCandidateFeed,
} from "@/lib/services/candidate-notes";
import {
  CandidateStatusError,
  parseCandidateStatus,
  setCandidateStatus,
} from "@/lib/services/candidate-status";
import { createPipelineStages } from "@/lib/services/vacancies";
import { quickCreateCandidate, searchCandidates } from "@/lib/services/candidates";
import { SourcingError } from "@/lib/services/sourcing";
import { candidateProfileSchema } from "@/lib/validation/candidate";

const ORG = "org_fattakhov";
const MARK = "test_cadd_";
const NUMBER = 92000 + Math.floor(Math.random() * 900);

const recruiter: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const client: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

let candidateId = "";
let leadId = "";
let vacancyId = "";
let applicationId = "";

async function cleanup() {
  const vacancies = await db.vacancy.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } });
  const vids = vacancies.map((v) => v.id);
  const candidates = await db.candidate.findMany({
    where: { OR: [{ id: { startsWith: MARK } }, { fullName: { startsWith: MARK } }] },
    select: { id: true },
  });
  const cids = candidates.map((c) => c.id);
  const apps = await db.application.findMany({
    where: { OR: [{ vacancyId: { in: vids } }, { candidateId: { in: cids } }] },
    select: { id: true },
  });
  const aids = apps.map((a) => a.id);
  await db.comment.deleteMany({ where: { OR: [{ candidateId: { in: cids } }, { applicationId: { in: aids } }] } });
  await db.attachment.deleteMany({ where: { candidateId: { in: cids } } });
  await db.stageTransition.deleteMany({ where: { applicationId: { in: aids } } });
  await db.application.deleteMany({ where: { id: { in: aids } } });
  await db.activityLog.deleteMany({ where: { entityType: "Candidate", entityId: { in: cids } } });
  await db.pipelineStage.deleteMany({ where: { vacancyId: { in: vids } } });
  await db.vacancy.deleteMany({ where: { id: { in: vids } } });
  await db.candidate.deleteMany({ where: { id: { in: cids } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

beforeEach(async () => {
  await cleanup();
  notifyMock.mockClear();

  const candidate = await db.candidate.create({
    data: {
      id: `${MARK}ok`,
      organizationId: ORG,
      fullName: `${MARK}Анна Иванова`,
      phone: "79001112233",
      city: "Казань",
      currentPosition: "Бухгалтер",
      skills: ["1С"],
      consentStatus: "GIVEN",
      createdById: "usr_owner",
    },
    select: { id: true },
  });
  candidateId = candidate.id;

  // Сорсинг-лид: найден без согласия, ограничения юриста действуют
  const lead = await db.candidate.create({
    data: {
      id: `${MARK}lead`,
      organizationId: ORG,
      fullName: `${MARK}Борис Лидов`,
      consentStatus: "PENDING",
      sourcedAt: new Date(),
      createdById: "usr_owner",
    },
    select: { id: true },
  });
  leadId = lead.id;

  const vacancy = await db.vacancy.create({
    data: {
      organizationId: ORG,
      clientId: "cl_technopark",
      number: NUMBER,
      title: `${MARK}вакансия`,
      status: "ACTIVE",
      createdById: "usr_owner",
    },
    select: { id: true },
  });
  vacancyId = vacancy.id;
  await createPipelineStages(vacancyId);
  const stage = await db.pipelineStage.findFirstOrThrow({ where: { vacancyId }, orderBy: { order: "asc" } });
  const application = await db.application.create({
    data: { organizationId: ORG, vacancyId, candidateId, stageId: stage.id, ownerId: "usr_rec1" },
    select: { id: true },
  });
  applicationId = application.id;
});

describe("рабочий статус кандидата", () => {
  it("ставится, меняется, снимается и пишется в журнал", async () => {
    expect(await setCandidateStatus(recruiter, candidateId, "WAITING_CLIENT")).toEqual({ from: null, to: "WAITING_CLIENT" });
    expect(await setCandidateStatus(recruiter, candidateId, "RESERVE")).toEqual({ from: "WAITING_CLIENT", to: "RESERVE" });
    expect(await setCandidateStatus(recruiter, candidateId, null)).toEqual({ from: "RESERVE", to: null });

    const log = await db.activityLog.findMany({ where: { entityType: "Candidate", entityId: candidateId, action: "status_changed" } });
    expect(log).toHaveLength(3);
  });

  it("то же значение второй раз ничего не пишет", async () => {
    await setCandidateStatus(recruiter, candidateId, "NEW");
    await setCandidateStatus(recruiter, candidateId, "NEW");
    expect(await db.activityLog.count({ where: { entityType: "Candidate", entityId: candidateId } })).toBe(1);
  });

  it("клиенту, чужой организации и неизвестному статусу отказ", async () => {
    await expect(setCandidateStatus(client, candidateId, "NEW")).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(setCandidateStatus({ ...recruiter, organizationId: "org_other" }, candidateId, "NEW")).rejects.toBeInstanceOf(CandidateStatusError);
    await expect(setCandidateStatus(recruiter, candidateId, "HACK" as never)).rejects.toBeInstanceOf(CandidateStatusError);
  });

  it("разбор значения из адреса: только известные статусы", () => {
    expect(parseCandidateStatus("WAITING_CLIENT")).toBe("WAITING_CLIENT");
    expect(parseCandidateStatus("waiting")).toBeNull();
    expect(parseCandidateStatus(undefined)).toBeNull();
  });

  it("фильтр списка по статусу; без фильтра видны все, и без статуса тоже", async () => {
    await setCandidateStatus(recruiter, candidateId, "RESERVE");
    const reserve = await searchCandidates(recruiter, { query: MARK, status: "RESERVE" });
    expect(reserve.items.map((c) => c.id)).toEqual([candidateId]);

    const all = await searchCandidates(recruiter, { query: MARK });
    expect(all.items.map((c) => c.id).sort()).toEqual([candidateId, leadId].sort());
    expect(all.items.find((c) => c.id === leadId)?.status).toBeNull();
  });

  it("новый кандидат, заведённый быстрым добавлением, получает «Новый»", async () => {
    const created = await quickCreateCandidate(recruiter, { fullName: `${MARK}Быстрый Новичок`, source: "OTHER" } as never);
    const row = await db.candidate.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("NEW");
  });
});

describe("правка профиля кандидата", () => {
  const base = { fullName: `${MARK}Анна Иванова`, skills: "1С" };
  const parse = (extra: Record<string, unknown>) => candidateProfileSchema.parse({ ...base, ...extra });

  it("меняет поля и пишет в журнал только названия, без значений", async () => {
    const { changed } = await editCandidateProfile(
      recruiter,
      candidateId,
      parse({ phone: "+7 900 111-22-33", currentPosition: "Бухгалтер", city: "Москва", salaryExpectation: "150000", skills: "1С, ЗУП" }),
    );
    expect(changed.sort()).toEqual(["city", "salaryExpectation", "skills"]);

    const row = await db.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    expect(row.city).toBe("Москва");
    expect(row.skills).toEqual(["1С", "ЗУП"]);

    const log = await db.activityLog.findFirstOrThrow({ where: { entityType: "Candidate", entityId: candidateId, action: "profile_edited" } });
    const text = JSON.stringify(log.diff);
    expect(text).toContain("city");
    expect(text).not.toContain("Москва");
    expect(text).not.toContain("79001112233");
  });

  it("телефон, лежащий в базе как «+7…», при сохранении без правок не считается изменённым", async () => {
    await db.candidate.update({ where: { id: candidateId }, data: { phone: "+79001112233" } });
    const { changed } = await editCandidateProfile(
      recruiter,
      candidateId,
      parse({ phone: "+79001112233", city: "Казань", currentPosition: "Бухгалтер" }),
    );
    expect(changed).toEqual([]);
  });

  it("очищенное поле стирается", async () => {
    await editCandidateProfile(recruiter, candidateId, parse({ phone: "79001112233", currentPosition: "" }));
    const row = await db.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    expect(row.currentPosition).toBeNull();
    expect(row.city).toBeNull();
  });

  it("без изменений ничего не пишет", async () => {
    const { changed } = await editCandidateProfile(
      recruiter,
      candidateId,
      parse({ phone: "8 (900) 111-22-33", city: "Казань", currentPosition: "Бухгалтер" }),
    );
    expect(changed).toEqual([]);
    expect(await db.activityLog.count({ where: { entityType: "Candidate", entityId: candidateId } })).toBe(0);
  });

  it("сорсинг-лиду нельзя добавить профиль, но имя и контакты можно", async () => {
    await expect(
      editCandidateProfile(recruiter, leadId, candidateProfileSchema.parse({ fullName: `${MARK}Борис Лидов`, city: "Уфа" })),
    ).rejects.toBeInstanceOf(SourcingError);

    const { changed } = await editCandidateProfile(
      recruiter,
      leadId,
      candidateProfileSchema.parse({ fullName: `${MARK}Борис Лидов`, phone: "+79005556677", telegram: "@boris" }),
    );
    expect(changed.sort()).toEqual(["phone", "telegram"]);
  });

  it("клиенту, чужой организации и несуществующему кандидату отказ", async () => {
    await expect(editCandidateProfile(client, candidateId, parse({}))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      editCandidateProfile({ ...recruiter, organizationId: "org_other" }, candidateId, parse({})),
    ).rejects.toBeInstanceOf(CandidateEditError);
    await expect(editCandidateProfile(recruiter, "нет-такого", parse({}))).rejects.toBeInstanceOf(CandidateEditError);
  });

  it("описание изменённых полей по-русски", () => {
    expect(describeChangedProfileFields(["phone", "salaryExpectation"])).toEqual(["Телефон", "Зарплатные ожидания"]);
  });
});

describe("комментарии под кандидатом", () => {
  it("без вакансии: заметка по кандидату в целом, всегда внутренняя", async () => {
    const { id } = await createCandidateComment(recruiter, { candidateId, body: "Звонила, готова выйти через 2 недели" });
    const row = await db.comment.findUniqueOrThrow({ where: { id } });
    expect(row.candidateId).toBe(candidateId);
    expect(row.applicationId).toBeNull();
    expect(row.visibility).toBe("INTERNAL");
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("галочку «показать работодателю» без вакансии принять нельзя", async () => {
    await expect(
      createCandidateComment(recruiter, { candidateId, body: "Показать", shareWithEmployer: true }),
    ).rejects.toThrow(/выберите вакансию/);
  });

  it("с вакансией и без галочки: внутренний комментарий в треде отклика", async () => {
    const { id } = await createCandidateComment(recruiter, { candidateId, applicationId, body: "Только для нас" });
    const row = await db.comment.findUniqueOrThrow({ where: { id } });
    expect(row.applicationId).toBe(applicationId);
    expect(row.visibility).toBe("INTERNAL");
  });

  it("с вакансией и галочкой: общий комментарий, работодатель его видит и получает уведомление", async () => {
    const { id } = await createCandidateComment(recruiter, {
      candidateId,
      applicationId,
      body: "Опыт с 1С подтверждён",
      shareWithEmployer: true,
    });
    const row = await db.comment.findUniqueOrThrow({ where: { id } });
    expect(row.visibility).toBe("SHARED");
    expect(notifyMock).toHaveBeenCalled();

    // Клиент видит его в треде отклика по тому же правилу, что и раньше
    const visible = await db.comment.findMany({ where: { applicationId, visibility: "SHARED" } });
    expect(visible.map((c) => c.id)).toContain(id);
  });

  it("заметка по кандидату в целом клиенту недоступна по построению: у неё нет отклика и вакансии", async () => {
    const { id } = await createCandidateComment(recruiter, { candidateId, body: "Внутреннее" });
    const forClient = await db.comment.findMany({
      where: { id, visibility: "SHARED", OR: [{ applicationId: { not: null } }, { vacancyId: { not: null } }] },
    });
    expect(forClient).toEqual([]);
  });

  it("чужой отклик (другого кандидата) не принимается", async () => {
    await expect(
      createCandidateComment(recruiter, { candidateId: leadId, applicationId, body: "Не туда" }),
    ).rejects.toBeInstanceOf(CandidateNoteError);
  });

  it("сорсинг-лиду заметки не сохраняются", async () => {
    await expect(createCandidateComment(recruiter, { candidateId: leadId, body: "Заметка" })).rejects.toThrow(/не дал согласие/);
  });

  it("пустой комментарий и клиент отклоняются", async () => {
    await expect(createCandidateComment(recruiter, { candidateId, body: "   " })).rejects.toBeInstanceOf(CandidateNoteError);
    await expect(createCandidateComment(client, { candidateId, body: "Привет" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("лента собирает заметки и комментарии по откликам, новые сверху; клиенту лента закрыта", async () => {
    await createCandidateComment(recruiter, { candidateId, body: "Первая заметка" });
    await createCandidateComment(recruiter, { candidateId, applicationId, body: "Вторая, по вакансии" });

    const feed = await listCandidateFeed(recruiter, candidateId);
    expect(feed.map((f) => f.body)).toEqual(["Вторая, по вакансии", "Первая заметка"]);
    expect(feed[0].application?.vacancyLabel).toContain(MARK);
    expect(feed[1].application).toBeNull();

    await expect(listCandidateFeed(client, candidateId)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await listCandidateFeed({ ...recruiter, organizationId: "org_other" }, candidateId)).toEqual([]);
  });
});

describe("файлы кандидата", () => {
  async function addFile(kind: "RESUME" | "PORTFOLIO", visibility: "INTERNAL" | "SHARED" = "INTERNAL") {
    return db.attachment.create({
      data: {
        organizationId: ORG,
        kind,
        fileName: `${MARK}файл.pdf`,
        fileSize: 1000,
        mimeType: "application/pdf",
        storageKey: `${MARK}key-${Math.random()}`,
        visibility,
        candidateId,
        uploadedById: "usr_rec1",
      },
      select: { id: true },
    });
  }

  it("виды файлов: резюме, портфолио, тестовое, прочее", () => {
    expect(parseCandidateFileKind("PORTFOLIO")).toBe("PORTFOLIO");
    expect(parseCandidateFileKind("CONTRACT")).toBeNull();
    expect(parseCandidateFileKind(undefined)).toBeNull();
  });

  it("по умолчанию файл внутренний; клиенту можно открыть всё, кроме исходного резюме", () => {
    expect(fileVisibility("PORTFOLIO", false)).toBe("INTERNAL");
    expect(fileVisibility("PORTFOLIO", true)).toBe("SHARED");
    expect(fileVisibility("TEST_TASK", true)).toBe("SHARED");
    expect(fileVisibility("RESUME", false)).toBe("INTERNAL");
    expect(() => fileVisibility("RESUME", true)).toThrow(CandidateFileError);
  });

  it("удаление мягкое: запись остаётся, из списка исчезает, в журнале есть след", async () => {
    const file = await addFile("PORTFOLIO");
    await deleteCandidateFile(recruiter, file.id);

    const raw = await db.attachment.findUniqueOrThrow({ where: { id: file.id } });
    expect(raw.deletedAt).not.toBeNull();
    const visible = await db.attachment.findMany({ where: { candidateId, deletedAt: null } });
    expect(visible.map((a) => a.id)).not.toContain(file.id);
    expect(await db.activityLog.count({ where: { entityType: "Candidate", entityId: candidateId, action: "file_deleted" } })).toBe(1);
  });

  it("повторное удаление, чужая организация и клиент отклоняются", async () => {
    const file = await addFile("PORTFOLIO");
    await deleteCandidateFile(recruiter, file.id);
    await expect(deleteCandidateFile(recruiter, file.id)).rejects.toBeInstanceOf(CandidateFileError);

    const other = await addFile("PORTFOLIO");
    await expect(deleteCandidateFile({ ...recruiter, organizationId: "org_other" }, other.id)).rejects.toBeInstanceOf(CandidateFileError);
    await expect(deleteCandidateFile(client, other.id)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
