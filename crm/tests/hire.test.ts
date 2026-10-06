/**
 * Найм: что происходит, когда кандидата переводят в «Нанят».
 *
 * До этого файла — ничего, кроме смены колонки. Исход, дата найма,
 * гарантия и сумма оффера оставались пустыми, а на них держатся счёт
 * (listBillableHires ищет outcome HIRED и hiredAt), аналитика наймов,
 * гарантия замены (BR-10) и удаление резюме после закрытия кандидата.
 * В тестовых данных это не было видно: seed пишет эти поля напрямую.
 * Нашлось сквозным прогоном процесса 21.09.2026.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  addToVacancy,
  ApplicationError,
  moveStage,
  recordGuaranteeCase,
  recordOffer,
} from "@/lib/services/applications";
import { revokeConsent } from "@/lib/services/consent";
import { listBillableHires } from "@/lib/services/invoices";

const ORG = "org_fattakhov";
const VACANCY = "vac_1"; // «Старфиш», действующий договор, гарантия 90 дней
const DAY = 86_400_000;
const PREFIX = "test_hire_";

const rec: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};
const owner: Actor = { ...rec, id: "usr_owner", role: "OWNER" };

let applicationId: string;

async function stageId(code: string) {
  const stage = await db.pipelineStage.findFirstOrThrow({
    where: { vacancyId: VACANCY, code },
    select: { id: true },
  });
  return stage.id;
}

async function cleanup() {
  const ids = (
    await db.candidate.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (ids.length === 0) return;
  const apps = (
    await db.application.findMany({
      where: { candidateId: { in: ids } },
      select: { id: true },
    })
  ).map((a) => a.id);
  await db.stageTransition.deleteMany({ where: { applicationId: { in: apps } } });
  await db.activityLog.deleteMany({ where: { entityId: { in: apps } } });
  await db.personalDataAccessLog.deleteMany({ where: { candidateId: { in: ids } } });
  await db.application.deleteMany({ where: { id: { in: apps } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

/** Кандидат, дошедший до оффера, — стартовая точка каждого сценария. */
async function candidateAtOffer(): Promise<string> {
  const id = `${PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.candidate.create({
    data: {
      id,
      organizationId: ORG,
      fullName: "Кандидат Для Найма",
      createdById: rec.id,
      consentStatus: "GIVEN",
      consentGivenAt: new Date(),
      consentExpiresAt: new Date(Date.now() + 300 * DAY),
    },
  });
  const { id: appId } = await addToVacancy(rec, VACANCY, id);
  // Путь до оффера проверяется в других файлах; здесь он — подготовка
  await db.application.update({
    where: { id: appId },
    data: { stageId: await stageId("OFFER"), presentedAt: new Date() },
  });
  return appId;
}

beforeEach(async () => {
  await cleanup();
  applicationId = await candidateAtOffer();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("без суммы оффера не нанимаем", () => {
  it("перевод в «Нанят» без оффера отказывает и объясняет почему", async () => {
    await expect(
      moveStage(rec, applicationId, await stageId("HIRED")),
    ).rejects.toThrow(/сумму оффера/);

    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { outcome: true, hiredAt: true, stage: { select: { code: true } } },
    });
    expect(app?.stage.code).toBe("OFFER");
    expect(app?.hiredAt).toBeNull();
  });
});

describe("найм записывает то, на чём держится всё после него", () => {
  it("исход, дата найма и гарантия от даты выхода", async () => {
    const start = new Date(Date.now() + 14 * DAY);
    await recordOffer(rec, applicationId, { salary: 180_000, startDate: start });
    await moveStage(rec, applicationId, await stageId("HIRED"));

    const app = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { outcome: true, hiredAt: true, guaranteeUntil: true },
    });
    expect(app.outcome).toBe("HIRED");
    expect(app.hiredAt).not.toBeNull();
    // 90 дней по договору «Старфиш», отсчёт от выхода, а не от нажатия
    const days = Math.round((app.guaranteeUntil!.getTime() - start.getTime()) / DAY);
    expect(days).toBe(90);
  });

  it("без даты выхода гарантия считается от найма", async () => {
    await recordOffer(rec, applicationId, { salary: 150_000 });
    await moveStage(rec, applicationId, await stageId("HIRED"));

    const app = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { hiredAt: true, guaranteeUntil: true },
    });
    const days = Math.round(
      (app.guaranteeUntil!.getTime() - app.hiredAt!.getTime()) / DAY,
    );
    expect(days).toBe(90);
  });

  it("нанятый попадает в список к выставлению счёта с посчитанной суммой", async () => {
    await recordOffer(rec, applicationId, { salary: 200_000 });
    await moveStage(rec, applicationId, await stageId("HIRED"));

    const hire = (await listBillableHires(owner)).find(
      (h) => h.applicationId === applicationId,
    );
    expect(hire, "живой найм обязан появиться в списке к оплате").toBeDefined();
    expect(hire?.offerSalary).toBe(200_000);
  });

  it("переход фиксирует исход «нанят» в истории", async () => {
    await recordOffer(rec, applicationId, { salary: 120_000 });
    await moveStage(rec, applicationId, await stageId("HIRED"));

    const last = await db.stageTransition.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      select: { toOutcome: true },
    });
    expect(last?.toOutcome).toBe("HIRED");
  });
});

describe("отмена найма", () => {
  it("возврат с «Нанят» снимает найм и убирает из списка к оплате", async () => {
    await recordOffer(rec, applicationId, { salary: 130_000 });
    await moveStage(rec, applicationId, await stageId("HIRED"));
    await moveStage(
      rec,
      applicationId,
      await stageId("OFFER"),
      "кандидат не вышел на работу",
    );

    const app = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { outcome: true, hiredAt: true, guaranteeUntil: true },
    });
    expect(app.outcome).toBe("IN_PROGRESS");
    expect(app.hiredAt).toBeNull();
    expect(app.guaranteeUntil).toBeNull();

    const hire = (await listBillableHires(owner)).find(
      (h) => h.applicationId === applicationId,
    );
    expect(hire).toBeUndefined();
  });
});

describe("оффер", () => {
  it("повторное сохранение не переписывает дату первого предложения", async () => {
    await recordOffer(rec, applicationId, { salary: 100_000 });
    const first = (await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { offerSentAt: true },
    })).offerSentAt!;

    await recordOffer(rec, applicationId, { salary: 110_000 });
    const after = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { offerSentAt: true, offerSalary: true },
    });
    expect(after.offerSentAt!.getTime()).toBe(first.getTime());
    expect(Number(after.offerSalary)).toBe(110_000);
  });

  it("по кандидату с отозванным согласием оффер не вносится", async () => {
    const app = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { candidateId: true },
    });
    await revokeConsent(owner, app.candidateId);

    await expect(
      recordOffer(rec, applicationId, { salary: 100_000 }),
    ).rejects.toThrow(ApplicationError);
  });
});

/*
  Гарантийный случай (BR-10). Клиенту обещано: ушёл в гарантийный срок —
  агентство ищет замену. Главное здесь не сама запись, а деньги:
  замена бесплатна, и её нельзя выставить в счёт как новый найм.
*/
describe("гарантийный случай", () => {
  async function hired(salary = 150_000): Promise<string> {
    const id = await candidateAtOffer();
    await recordOffer(rec, id, { salary });
    await moveStage(rec, id, await stageId("HIRED"));
    return id;
  }

  it("записывается в гарантийный срок, найм остаётся оплаченным", async () => {
    const id = await hired();
    await recordGuaranteeCase(rec, id, {
      leftAt: new Date(),
      reason: "PROBATION_FAILED",
      comment: "не прошёл испытательный",
    });

    const app = await db.application.findUniqueOrThrow({
      where: { id },
      select: { outcome: true, guaranteeBrokenAt: true, guaranteeBreakReason: true },
    });
    expect(app.outcome).toBe("HIRED");
    expect(app.guaranteeBrokenAt).not.toBeNull();
    expect(app.guaranteeBreakReason).toBe("PROBATION_FAILED");

    const log = await db.activityLog.findFirst({
      where: { entityId: id, action: "guarantee_case" },
      select: { actorId: true },
    });
    expect(log?.actorId).toBe(rec.id);
  });

  it("после конца гарантии — не гарантийный случай", async () => {
    const id = await hired();
    const until = (await db.application.findUniqueOrThrow({
      where: { id },
      select: { guaranteeUntil: true },
    })).guaranteeUntil!;

    await expect(
      recordGuaranteeCase(rec, id, {
        leftAt: new Date(until.getTime() + 2 * DAY),
        reason: "CANDIDATE_LEFT",
      }),
    ).rejects.toThrow(/Гарантия закончилась/);
  });

  it("ушёл в последний день гарантии — ещё гарантийный случай", async () => {
    const id = await hired();
    const until = (await db.application.findUniqueOrThrow({
      where: { id },
      select: { guaranteeUntil: true },
    })).guaranteeUntil!;
    const lastDayEvening = new Date(until);
    lastDayEvening.setHours(20, 0, 0, 0);

    await expect(
      recordGuaranteeCase(rec, id, { leftAt: lastDayEvening, reason: "DISMISSED" }),
    ).resolves.toEqual({ vacancyId: VACANCY });
  });

  it("у ненанятого гарантийного случая не бывает", async () => {
    await expect(
      recordGuaranteeCase(rec, applicationId, {
        leftAt: new Date(),
        reason: "CANDIDATE_LEFT",
      }),
    ).rejects.toThrow(ApplicationError);
  });

  it("второй раз по тому же найму не записывается", async () => {
    const id = await hired();
    await recordGuaranteeCase(rec, id, { leftAt: new Date(), reason: "OTHER" });
    await expect(
      recordGuaranteeCase(rec, id, { leftAt: new Date(), reason: "OTHER" }),
    ).rejects.toThrow(/уже записан/);
  });

  it("замена отмечается сама и в счёт не попадает, исходный найм — попадает", async () => {
    const original = await hired(200_000);
    await recordGuaranteeCase(rec, original, {
      leftAt: new Date(),
      reason: "CANDIDATE_LEFT",
    });

    const replacement = await hired(210_000);

    const app = await db.application.findUniqueOrThrow({
      where: { id: replacement },
      select: { replacementForId: true },
    });
    expect(app.replacementForId).toBe(original);

    const billable = (await listBillableHires(owner)).map((h) => h.applicationId);
    expect(billable, "за исходный найм счёт выставляется").toContain(original);
    expect(billable, "замена по гарантии бесплатна").not.toContain(replacement);
  });

  it("сорвавшаяся замена освобождает случай для следующей", async () => {
    const original = await hired();
    await recordGuaranteeCase(rec, original, { leftAt: new Date(), reason: "OTHER" });
    const replacement = await hired();

    await moveStage(rec, replacement, await stageId("OFFER"), "не вышел");
    const undone = await db.application.findUniqueOrThrow({
      where: { id: replacement },
      select: { replacementForId: true },
    });
    expect(undone.replacementForId).toBeNull();

    const next = await hired();
    const nextApp = await db.application.findUniqueOrThrow({
      where: { id: next },
      select: { replacementForId: true },
    });
    expect(nextApp.replacementForId).toBe(original);
  });
});
