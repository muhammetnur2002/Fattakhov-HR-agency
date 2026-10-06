/**
 * Удаление исходных файлов резюме (Политика, раздел 8).
 *
 * Политика обещает кандидату, что сырой файл не хранится постоянно.
 * Срок — 30 дней после закрытия кандидата, решение заказчика
 * от 19.09.2026; в законе числа нет, там «не дольше, чем требует цель».
 *
 * Проверяется ровно то, на чём такая задача обычно и ошибается:
 * не удалить файл у человека, с которым ещё работают, и не оставить
 * файл у того, чьё согласие кончилось.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { addToVacancy } from "@/lib/services/applications";
import { purgeClosedResumes } from "@/lib/services/pdn-retention";

const ORG = "org_fattakhov";
const VACANCY = "vac_1";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const PREFIX = "test_purge_";
const DAY = 86_400_000;

let candidateId: string;

async function cleanup() {
  const ids = (
    await db.candidate.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (ids.length === 0) return;

  const appIds = (
    await db.application.findMany({
      where: { candidateId: { in: ids } },
      select: { id: true },
    })
  ).map((a) => a.id);

  await db.stageTransition.deleteMany({
    where: { applicationId: { in: appIds } },
  });
  await db.disclosureConsent.deleteMany({ where: { candidateId: { in: ids } } });
  await db.personalDataAccessLog.deleteMany({
    where: { candidateId: { in: ids } },
  });
  await db.attachment.deleteMany({ where: { candidateId: { in: ids } } });
  await db.application.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

/** Резюме кандидата. Файла в хранилище нет — задача такое переживает. */
async function addResume(): Promise<string> {
  const a = await db.attachment.create({
    data: {
      organizationId: ORG,
      kind: "RESUME",
      fileName: "resume.pdf",
      fileSize: 1000,
      mimeType: "application/pdf",
      storageKey: `${PREFIX}${Date.now()}_${Math.random()}`,
      candidateId,
      uploadedById: recruiter.id,
    },
    select: { id: true },
  });
  return a.id;
}

/**
 * Закрыть заявку и отодвинуть её в прошлое.
 *
 * updatedAt проставляет сама Prisma (@updatedAt), обычным update его
 * не задать — поэтому сырым запросом.
 */
async function closeApplication(id: string, daysAgo: number, outcome = "REJECTED") {
  const when = new Date(Date.now() - daysAgo * DAY);
  await db.application.update({ where: { id }, data: { outcome: outcome as never } });
  await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${when} WHERE id = ${id}`;
}

async function isPurged(attachmentId: string): Promise<boolean> {
  const a = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { deletedAt: true },
  });
  return a?.deletedAt != null;
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  candidateId = `${PREFIX}${Date.now()}`;
  await db.candidate.create({
    data: {
      id: candidateId,
      organizationId: ORG,
      fullName: "Тестовый Кандидат",
      createdById: recruiter.id,
      // Действующее согласие: иначе сработает другое правило
      consentStatus: "GIVEN",
      consentGivenAt: new Date(),
      consentExpiresAt: new Date(Date.now() + 300 * DAY),
    },
  });
});

describe("после закрытия кандидата", () => {
  it("через 30 дней файл удаляется", async () => {
    const resume = await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(id, 31);

    expect(await purgeClosedResumes()).toBe(1);
    expect(await isPurged(resume)).toBe(true);
  });

  it("на 29-й день файл ещё на месте", async () => {
    const resume = await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(id, 29);

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });

  it("удаление записывается в журнал доступа к ПДн", async () => {
    await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(id, 31);
    await purgeClosedResumes();

    const log = await db.personalDataAccessLog.findFirst({
      where: { candidateId, action: { startsWith: "resume_purged" } },
    });
    expect(log?.action).toBe("resume_purged_after_close");
  });

  it("второй проход ничего не трогает", async () => {
    await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(id, 31);

    expect(await purgeClosedResumes()).toBe(1);
    expect(await purgeClosedResumes()).toBe(0);
  });
});

describe("пока с кандидатом работают", () => {
  it("заявка в работе — файл остаётся, даже если ей полгода", async () => {
    const resume = await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${new Date(
      Date.now() - 180 * DAY,
    )} WHERE id = ${id}`;

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });

  it("одна заявка закрыта, вторая в работе — файл остаётся", async () => {
    const resume = await addResume();
    const closed = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(closed.id, 100);
    await addToVacancy(recruiter, "vac_2", candidateId);

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });

  it("пауза клиента закрытием не считается", async () => {
    const resume = await addResume();
    const { id } = await addToVacancy(recruiter, VACANCY, candidateId);
    await closeApplication(id, 100, "ON_HOLD");

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });

  it("кандидат без заявок вовсе — файл живёт до конца согласия", async () => {
    const resume = await addResume();

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });

  it("согласие ещё не получено — файл не трогается", async () => {
    // Кандидата только завели вместе с резюме, ссылка на согласие ушла.
    // «Согласия ещё нет» — не «согласие кончилось»: удалить файл сейчас
    // значило бы сорвать представление. В CRM агентства этот случай
    // попадал под немедленное удаление
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentStatus: "PENDING",
        consentGivenAt: null,
        consentExpiresAt: null,
      },
    });
    const resume = await addResume();
    await addToVacancy(recruiter, VACANCY, candidateId);

    expect(await purgeClosedResumes()).toBe(0);
    expect(await isPurged(resume)).toBe(false);
  });
});

describe("когда согласие кончилось", () => {
  it("файл удаляется независимо от заявок", async () => {
    const resume = await addResume();
    // Заявка свежая и в работе — по сроку закрытия файл бы остался
    await addToVacancy(recruiter, VACANCY, candidateId);
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentExpiresAt: new Date(Date.now() - DAY) },
    });

    expect(await purgeClosedResumes()).toBe(1);
    expect(await isPurged(resume)).toBe(true);
  });

  it("причина удаления видна в журнале отдельно", async () => {
    await addResume();
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "REVOKED" },
    });
    await purgeClosedResumes();

    const log = await db.personalDataAccessLog.findFirst({
      where: { candidateId, action: { startsWith: "resume_purged" } },
    });
    expect(log?.action).toBe("resume_purged_consent_over");
  });
});
