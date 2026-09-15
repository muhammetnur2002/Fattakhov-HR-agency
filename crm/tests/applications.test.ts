/**
 * Правила работы с кандидатом в воронке — на реальной БД.
 *
 * Здесь проверяется то, что нельзя проверить на чистых функциях:
 * уникальность в пределах вакансии, блокирующие условия представления,
 * запись истории переходов. Тесты создают свои данные и убирают
 * их за собой, чтобы seed оставался неизменным.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  addToVacancy,
  ApplicationError,
  getApplication,
  listPipeline,
  markConsentGiven,
  moveStage,
  presentToClient,
  rejectApplication,
  setClientDecision,
} from "@/lib/services/applications";

const ORG = "org_fattakhov";
const VACANCY = "vac_1"; // ACTIVE, воронка из семи этапов

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

/** Всё, что создано тестами, помечается этим префиксом и удаляется в конце. */
const PREFIX = "test_app_";
let candidateId: string;
let stages: { id: string; code: string; order: number }[];

async function cleanup() {
  const candidates = await db.candidate.findMany({
    where: { id: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) return;

  const apps = await db.application.findMany({
    where: { candidateId: { in: ids } },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  await db.stageTransition.deleteMany({
    where: { applicationId: { in: appIds } },
  });
  await db.interviewSlot.deleteMany({
    where: { interview: { applicationId: { in: appIds } } },
  });
  await db.interview.deleteMany({ where: { applicationId: { in: appIds } } });
  await db.commentRead.deleteMany({
    where: { comment: { applicationId: { in: appIds } } },
  });
  await db.comment.deleteMany({ where: { applicationId: { in: appIds } } });
  await db.personalDataAccessLog.deleteMany({
    where: { candidateId: { in: ids } },
  });
  await db.attachment.deleteMany({ where: { candidateId: { in: ids } } });
  await db.application.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  stages = await db.pipelineStage.findMany({
    where: { vacancyId: VACANCY },
    orderBy: { order: "asc" },
    select: { id: true, code: true, order: true },
  });

  expect(stages.length, "у вакансии должна быть воронка").toBeGreaterThan(0);
});

beforeEach(async () => {
  await cleanup();

  candidateId = `${PREFIX}${Date.now()}`;
  await db.candidate.create({
    data: {
      id: candidateId,
      organizationId: ORG,
      fullName: "Тестовый Кандидат",
      phone: "79990000000",
      createdById: recruiter.id,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("добавление в воронку", () => {
  it("кандидат попадает на первый этап воронки", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    const app = await db.application.findUnique({
      where: { id },
      select: { stageId: true, outcome: true },
    });

    expect(app?.stageId).toBe(stages[0].id);
    expect(app?.outcome).toBe("IN_PROGRESS");
  });

  it("первый этап скрыт от клиента — иначе порог видимости не работает", () => {
    expect(stages[0].code).toBe("LONGLIST");
  });

  it("добавление создаёт запись в истории", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    const transitions = await db.stageTransition.findMany({
      where: { applicationId: id },
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0].toStageId).toBe(stages[0].id);
  });

  it("BR-6: повторное добавление в ту же вакансию отклоняется", async () => {
    await addToVacancy(recruiter, VACANCY, candidateId);

    await expect(
      addToVacancy(recruiter, VACANCY, candidateId),
    ).rejects.toThrow(ApplicationError);
  });

  /*
    Тест выше добавляет по очереди — там срабатывает проверка «уже есть»
    и человек получает понятный текст. Два клика подряд успевают
    прочитать «ещё нет» оба, и последнее слово остаётся за уникальным
    индексом. Его отказ обязан выглядеть так же: иначе на второй клик
    человек увидит «Что-то пошло не так» вместо «он уже здесь».
  */
  it("BR-6: два одновременных добавления — одна заявка и понятный отказ", async () => {
    const results = await Promise.allSettled([
      addToVacancy(recruiter, VACANCY, candidateId),
      addToVacancy(recruiter, VACANCY, candidateId),
    ]);

    const успешные = results.filter((r) => r.status === "fulfilled");
    const отказы = results.filter((r) => r.status === "rejected");

    expect(успешные).toHaveLength(1);
    expect(отказы).toHaveLength(1);
    // Именно ApplicationError, а не сырая ошибка Prisma
    expect((отказы[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ApplicationError,
    );

    const заявок = await db.application.count({
      where: { vacancyId: VACANCY, candidateId },
    });
    expect(заявок).toBe(1);
  });

  it("заявка и первая запись истории появляются вместе", async () => {
    // Порознь они могли разойтись: кандидат в воронке, а история
    // начинается с пустоты
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    const переходы = await db.stageTransition.findMany({
      where: { applicationId: id },
      select: { comment: true },
    });

    expect(переходы).toHaveLength(1);
    expect(переходы[0].comment).toBe("Добавлен в воронку");
  });

  it("несуществующий кандидат не добавляется", async () => {
    await expect(
      addToVacancy(recruiter, VACANCY, "нет-такого"),
    ).rejects.toThrow(ApplicationError);
  });
});

describe("переходы по этапам", () => {
  it("вперёд можно перепрыгнуть через этап", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    const final = stages.find((s) => s.code === "FINAL")!;

    await moveStage(recruiter, id, final.id);

    const app = await db.application.findUnique({
      where: { id },
      select: { stageId: true },
    });
    expect(app?.stageId).toBe(final.id);
  });

  it("назад — только с комментарием", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    const screening = stages.find((s) => s.code === "SCREENING")!;
    await moveStage(recruiter, id, screening.id);

    await expect(
      moveStage(recruiter, id, stages[0].id),
    ).rejects.toThrow(/комментарием/);

    // с комментарием проходит
    await moveStage(recruiter, id, stages[0].id, "Клиент попросил вернуть в резерв");
    const app = await db.application.findUnique({
      where: { id },
      select: { stageId: true },
    });
    expect(app?.stageId).toBe(stages[0].id);
  });

  it("в «Представлен» через обычный перевод не попасть", async () => {
    // Иначе можно было бы обойти проверки BR-4 перетаскиванием карточки
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    const presented = stages.find((s) => s.code === "PRESENTED")!;

    await expect(moveStage(recruiter, id, presented.id)).rejects.toThrow(
      /саммари и резюме/,
    );
  });

  it("этап чужой вакансии не принимается", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    const foreign = await db.pipelineStage.findFirst({
      where: { vacancyId: { not: VACANCY } },
      select: { id: true },
    });

    await expect(moveStage(recruiter, id, foreign!.id)).rejects.toThrow(
      /не принадлежит/,
    );
  });

  it("история копит переходы и считает время на этапе", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    const screening = stages.find((s) => s.code === "SCREENING")!;
    await moveStage(recruiter, id, screening.id);

    const transitions = await db.stageTransition.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: "asc" },
    });

    expect(transitions).toHaveLength(2);
    expect(transitions[1].fromStageId).toBe(stages[0].id);
    expect(transitions[1].hoursInPreviousStage).not.toBeNull();
  });
});

describe("представление клиенту (BR-4, BR-33)", () => {
  const summary =
    "Восемь лет в диспетчеризации, последние три — руководил сменой из шести человек. " +
    "Знает 1С:ТМС, готов к посменному графику. Ищет стабильность, а не рост в деньгах.";

  it("без согласия на обработку ПДн не представляется", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    await expect(
      presentToClient(recruiter, id, {
        presentationSummary: summary,
        salaryExpectation: 120_000,
      }),
    ).rejects.toThrow(/согласия/);
  });

  it("без резюме не представляется", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);

    await expect(
      presentToClient(recruiter, id, {
        presentationSummary: summary,
        salaryExpectation: 120_000,
      }),
    ).rejects.toThrow(/резюме/);
  });

  it("с согласием и резюме — представляется и становится виден клиенту", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);
    await db.attachment.create({
      data: {
        organizationId: ORG,
        kind: "RESUME",
        fileName: "resume.pdf",
        fileSize: 1000,
        mimeType: "application/pdf",
        storageKey: `${PREFIX}key`,
        candidateId,
        uploadedById: recruiter.id,
      },
    });

    await presentToClient(recruiter, id, {
      presentationSummary: summary,
      salaryExpectation: 120_000,
    });

    const app = await db.application.findUnique({
      where: { id },
      select: {
        presentedAt: true,
        presentedById: true,
        presentationSummary: true,
        stage: { select: { code: true, visibleToClient: true } },
      },
    });

    expect(app?.presentedAt).not.toBeNull();
    expect(app?.presentedById).toBe(recruiter.id);
    expect(app?.stage.code).toBe("PRESENTED");
    expect(app?.stage.visibleToClient).toBe(true);
  });

  it("зарплатное ожидание записывается в карточку кандидата", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);
    await db.attachment.create({
      data: {
        organizationId: ORG,
        kind: "RESUME",
        fileName: "r.pdf",
        fileSize: 10,
        mimeType: "application/pdf",
        storageKey: `${PREFIX}key2`,
        candidateId,
        uploadedById: recruiter.id,
      },
    });

    await presentToClient(recruiter, id, {
      presentationSummary: summary,
      salaryExpectation: 145_000,
    });

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { salaryExpectation: true },
    });
    expect(Number(candidate?.salaryExpectation)).toBe(145_000);
  });
});

/**
 * Критерий Этапа 4 из ТЗ: клиент не видит кандидатов на лонг-листе,
 * и проверять это надо не глазами, а тем же запросом, которым
 * пользуется интерфейс.
 */
describe("порог видимости через сервис (BR-3)", () => {
  const starfishAdmin: Actor = {
    id: "usr_cl_admin",
    organizationId: ORG,
    role: "CLIENT_ADMIN",
    clientId: "cl_starfish",
  };

  const summary =
    "Восемь лет в диспетчеризации, последние три — руководил сменой. " +
    "Знает 1С:ТМС, готов к посменному графику, ищет стабильность.";

  async function addResume() {
    await db.attachment.create({
      data: {
        organizationId: ORG,
        kind: "RESUME",
        fileName: "r.pdf",
        fileSize: 10,
        mimeType: "application/pdf",
        storageKey: `${PREFIX}${Date.now()}`,
        candidateId,
        uploadedById: recruiter.id,
      },
    });
  }

  it("свежедобавленный кандидат не приходит клиенту в воронке", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    const forAgency = await listPipeline(recruiter, VACANCY);
    const forClient = await listPipeline(starfishAdmin, VACANCY);

    expect(forAgency.map((a) => a.id)).toContain(id);
    expect(forClient.map((a) => a.id)).not.toContain(id);
  });

  it("карточка непредставленного кандидата клиенту не открывается", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    // null → страница отдаст 404 (BR-28)
    expect(await getApplication(starfishAdmin, id)).toBeNull();
    expect(await getApplication(recruiter, id)).not.toBeNull();
  });

  it("после представления кандидат появляется у клиента", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);
    await addResume();

    expect(await getApplication(starfishAdmin, id)).toBeNull();

    await presentToClient(recruiter, id, {
      presentationSummary: summary,
      salaryExpectation: 120_000,
    });

    const visible = await getApplication(starfishAdmin, id);
    expect(visible?.id).toBe(id);
    expect(visible?.presentationSummary).toBe(summary);
  });

  it("возврат на скрытый этап не прячет уже представленного", async () => {
    // Иначе отклонённый кандидат исчезал бы из истории клиента
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);
    await addResume();
    await presentToClient(recruiter, id, {
      presentationSummary: summary,
      salaryExpectation: 120_000,
    });

    const screening = stages.find((s) => s.code === "SCREENING")!;
    await moveStage(recruiter, id, screening.id, "Вернули на доработку");

    const stillVisible = await getApplication(starfishAdmin, id);
    expect(stillVisible?.id).toBe(id);
  });

  it("ни один кандидат клиента не сидит на скрытом этапе без представления", async () => {
    // Сквозная проверка по всей воронке, а не только по тестовым данным
    const forClient = await listPipeline(starfishAdmin, VACANCY);
    const stageById = new Map(stages.map((s) => [s.id, s]));

    const leaked = forClient.filter((a) => {
      const stage = stageById.get(a.stageId);
      return stage && !isVisibleStage(stage.code) && a.presentedAt === null;
    });

    expect(leaked).toHaveLength(0);
  });

  function isVisibleStage(code: string): boolean {
    return code !== "LONGLIST" && code !== "SCREENING";
  }
});

describe("решения клиента (BR-12, BR-13, BR-14)", () => {
  const clientAdmin: Actor = {
    id: "usr_cl_admin",
    organizationId: ORG,
    role: "CLIENT_ADMIN",
    clientId: "cl_starfish",
  };

  const summary =
    "Восемь лет в диспетчеризации, последние три — руководил сменой. " +
    "Знает 1С:ТМС, готов к посменному графику, ищет стабильность.";

  /** Доводит кандидата до состояния «представлен клиенту». */
  async function present(): Promise<string> {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await markConsentGiven(recruiter, candidateId);
    await db.attachment.create({
      data: {
        organizationId: ORG,
        kind: "RESUME",
        fileName: "r.pdf",
        fileSize: 10,
        mimeType: "application/pdf",
        storageKey: `${PREFIX}${Date.now()}_${Math.random()}`,
        candidateId,
        uploadedById: recruiter.id,
      },
    });
    await presentToClient(recruiter, id, {
      presentationSummary: summary,
      salaryExpectation: 120_000,
    });
    return id;
  }

  it("BR-12: по непредставленному кандидату решать нечего", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    await expect(
      setClientDecision(clientAdmin, id, "INTERVIEW"),
    ).rejects.toThrow(/не представлен/);
  });

  it("BR-13: приглашение на интервью заводит встречу для рекрутера", async () => {
    const id = await present();

    await setClientDecision(clientAdmin, id, "INTERVIEW");

    const interview = await db.interview.findFirst({
      where: { applicationId: id },
      select: { status: true, type: true },
    });

    expect(interview?.status).toBe("SLOTS_REQUESTED");
    expect(interview?.type).toBe("CLIENT");
  });

  it("повторное приглашение не плодит вторую встречу", async () => {
    const id = await present();

    await setClientDecision(clientAdmin, id, "INTERVIEW");
    await setClientDecision(clientAdmin, id, "INTERVIEW");

    const count = await db.interview.count({ where: { applicationId: id } });
    expect(count).toBe(1);
  });

  it("приглашение двигает кандидата на этап интервью", async () => {
    const id = await present();
    await setClientDecision(clientAdmin, id, "INTERVIEW");

    const app = await db.application.findUnique({
      where: { id },
      select: { stage: { select: { code: true } }, clientDecision: true },
    });

    expect(app?.stage.code).toBe("CLIENT_INTERVIEW");
    expect(app?.clientDecision).toBe("INTERVIEW");
  });

  it("пауза не выкидывает кандидата из воронки", async () => {
    const id = await present();
    await setClientDecision(clientAdmin, id, "HOLD");

    const app = await db.application.findUnique({
      where: { id },
      select: { outcome: true, clientDecision: true },
    });

    expect(app?.outcome).toBe("ON_HOLD");
    expect(app?.clientDecision).toBe("HOLD");
  });

  it("отказ без причины не проходит", async () => {
    const id = await present();

    await expect(
      setClientDecision(clientAdmin, id, "REJECT"),
    ).rejects.toThrow(/причину/);
  });

  it("отказ с причиной фиксирует и решение, и причину", async () => {
    const id = await present();

    await setClientDecision(clientAdmin, id, "REJECT", {
      rejection: {
        rejectionReason: "SALARY_TOO_HIGH",
        rejectedBy: "CLIENT",
        rejectionComment: undefined,
      },
    });

    const app = await db.application.findUnique({
      where: { id },
      select: {
        outcome: true,
        clientDecision: true,
        rejectionReason: true,
        clientDecisionById: true,
      },
    });

    expect(app?.outcome).toBe("REJECTED");
    expect(app?.clientDecision).toBe("REJECT");
    expect(app?.rejectionReason).toBe("SALARY_TOO_HIGH");
    expect(app?.clientDecisionById).toBe(clientAdmin.id);
  });

  it("BR-14: решение со слов клиента помечается отдельно", async () => {
    const id = await present();

    // Вносит рекрутер, а не клиент
    await setClientDecision(recruiter, id, "HOLD", { onBehalf: true });

    const app = await db.application.findUnique({
      where: { id },
      select: { clientDecisionById: true, submittedOnBehalfById: true },
    });

    // Не приписываем решение клиенту: видно, что его внесло агентство
    expect(app?.clientDecisionById).toBeNull();
    expect(app?.submittedOnBehalfById).toBe(recruiter.id);
  });

  it("решение самого клиента не помечается как внесённое за него", async () => {
    const id = await present();
    await setClientDecision(clientAdmin, id, "HOLD");

    const app = await db.application.findUnique({
      where: { id },
      select: { clientDecisionById: true, submittedOnBehalfById: true },
    });

    expect(app?.clientDecisionById).toBe(clientAdmin.id);
    expect(app?.submittedOnBehalfById).toBeNull();
  });

  it("решение попадает в историю переходов", async () => {
    const id = await present();
    await setClientDecision(clientAdmin, id, "INTERVIEW");

    const last = await db.stageTransition.findFirst({
      where: { applicationId: id },
      orderBy: { createdAt: "desc" },
    });

    expect(last?.comment).toContain("интервью");
    expect(last?.actorId).toBe(clientAdmin.id);
  });
});

describe("отказы (BR-11)", () => {
  it("отказ фиксирует причину и сторону", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    await rejectApplication(recruiter, id, {
      rejectionReason: "SALARY_TOO_HIGH",
      rejectedBy: "CLIENT",
      rejectionComment: undefined,
    });

    const app = await db.application.findUnique({
      where: { id },
      select: { outcome: true, rejectionReason: true, rejectedBy: true },
    });

    expect(app?.outcome).toBe("REJECTED");
    expect(app?.rejectionReason).toBe("SALARY_TOO_HIGH");
    expect(app?.rejectedBy).toBe("CLIENT");
  });

  it("отказ самого кандидата — это не отказ клиента", async () => {
    // Различие важно для аналитики: «мы не подошли» и «нам не подошли»
    // это разные проблемы
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);

    await rejectApplication(recruiter, id, {
      rejectionReason: "ACCEPTED_OTHER_OFFER",
      rejectedBy: "CANDIDATE",
      rejectionComment: undefined,
    });

    const app = await db.application.findUnique({
      where: { id },
      select: { outcome: true },
    });
    expect(app?.outcome).toBe("WITHDRAWN");
  });

  it("повторный отказ не проходит", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await rejectApplication(recruiter, id, {
      rejectionReason: "CULTURE_FIT",
      rejectedBy: "CLIENT",
      rejectionComment: undefined,
    });

    await expect(
      rejectApplication(recruiter, id, {
        rejectionReason: "OTHER",
        rejectedBy: "AGENCY",
        rejectionComment: "ещё раз",
      }),
    ).rejects.toThrow(ApplicationError);
  });

  it("возврат в работу снимает причину отказа", async () => {
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await rejectApplication(recruiter, id, {
      rejectionReason: "SKILLS_MISMATCH",
      rejectedBy: "CLIENT",
      rejectionComment: undefined,
    });

    const screening = stages.find((s) => s.code === "SCREENING")!;
    await moveStage(recruiter, id, screening.id, "Клиент передумал");

    const app = await db.application.findUnique({
      where: { id },
      select: { outcome: true, rejectionReason: true, rejectedBy: true },
    });

    expect(app?.outcome).toBe("IN_PROGRESS");
    expect(app?.rejectionReason).toBeNull();
    expect(app?.rejectedBy).toBeNull();
  });
});
