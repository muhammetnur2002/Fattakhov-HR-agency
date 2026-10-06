/**
 * Контур уничтожения персональных данных (ст. 21 152-ФЗ).
 *
 * Проверяется не «функция отработала», а обязанности оператора:
 * обработка прекращается сразу, срок назначается сам, уничтожение
 * происходит даже без участия человека, а уже заблокированные данные
 * нельзя использовать.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  addToVacancy,
  ApplicationError,
  markConsentGiven,
  moveStage,
  presentToClient,
} from "@/lib/services/applications";
import { giveConsent, revokeConsent } from "@/lib/services/consent";
import {
  ERASURE_DEADLINE_DAYS,
  ErasureError,
  blockForErasure,
  erasureBlocksProcessing,
  listErasureQueue,
  queueErasure,
} from "@/lib/services/erasure";
import {
  erasePersonalData,
  runErasureQueue,
} from "@/lib/services/pdn-retention";

const ORG = "org_fattakhov";
const VACANCY = "vac_1";
const DAY = 86_400_000;

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const PREFIX = "test_erase_";
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

/** Кандидат с действующим согласием — обычное рабочее состояние. */
async function makeCandidate(): Promise<string> {
  const id = `${PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.candidate.create({
    data: {
      id,
      organizationId: ORG,
      fullName: "Тестовый Кандидат",
      phone: "+70000000000",
      email: "test@example.com",
      createdById: owner.id,
      consentStatus: "GIVEN",
      consentGivenAt: new Date(),
      consentExpiresAt: new Date(Date.now() + 300 * DAY),
    },
  });
  return id;
}

async function stateOf(id: string) {
  return db.candidate.findUnique({
    where: { id },
    select: {
      erasureState: true,
      erasureReason: true,
      erasureDueAt: true,
      fullName: true,
      phone: true,
      email: true,
    },
  });
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  candidateId = await makeCandidate();
});

describe("предикат блокировки", () => {
  it("работать можно только в ACTIVE", () => {
    expect(erasureBlocksProcessing("ACTIVE")).toBe(false);
    expect(erasureBlocksProcessing("BLOCKED_FOR_ERASURE")).toBe(true);
    expect(erasureBlocksProcessing("ERASURE_PENDING")).toBe(true);
    expect(erasureBlocksProcessing("ANONYMIZED")).toBe(true);
  });
});

describe("отзыв согласия", () => {
  it("прекращает обработку сразу и назначает тридцатидневный срок", async () => {
    await revokeConsent(owner, candidateId);

    const c = await stateOf(candidateId);
    expect(c?.erasureState).toBe("BLOCKED_FOR_ERASURE");
    expect(c?.erasureReason).toBe("CONSENT_REVOKED");

    const days = Math.round((c!.erasureDueAt!.getTime() - Date.now()) / DAY);
    expect(days).toBe(ERASURE_DEADLINE_DAYS);
  });

  it("повторный отзыв не продлевает срок", async () => {
    await revokeConsent(owner, candidateId);
    const first = (await stateOf(candidateId))!.erasureDueAt!;

    await db.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "GIVEN" },
    });
    await revokeConsent(owner, candidateId);

    const second = (await stateOf(candidateId))!.erasureDueAt!;
    expect(second.getTime()).toBe(first.getTime());
  });
});

describe("заблокированные данные не используются", () => {
  it("кандидата нельзя двигать по воронке", async () => {
    const { id } = await addToVacancy(owner, VACANCY, candidateId);
    const stages = await db.pipelineStage.findMany({
      where: { vacancyId: VACANCY },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    await revokeConsent(owner, candidateId);

    await expect(moveStage(owner, id, stages[1].id)).rejects.toThrow(
      ApplicationError,
    );
  });

  it("кандидата нельзя представить клиенту", async () => {
    const { id } = await addToVacancy(owner, VACANCY, candidateId);
    await revokeConsent(owner, candidateId);

    await expect(
      presentToClient(owner, id, {
        presentationSummary:
          "Достаточно длинное саммари для прохождения проверки формы, " +
          "чтобы упереться именно в блокировку, а не в длину текста.",
        salaryExpectation: 100_000,
      }),
    ).rejects.toThrow(/прекращена|уничтожены/);
  });
});

describe("продление согласия", () => {
  it("снимает блокировку, если она была из-за истёкшего срока", async () => {
    await blockForErasure({
      candidateId,
      organizationId: ORG,
      reason: "CONSENT_EXPIRED",
      actorId: candidateId,
    });
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentStatus: "EXPIRED",
        consentToken: "test-token-expired",
        consentTokenExpiresAt: new Date(Date.now() + DAY),
      },
    });

    await giveConsent({ token: "test-token-expired" });

    const c = await stateOf(candidateId);
    expect(c?.erasureState).toBe("ACTIVE");
    expect(c?.erasureDueAt).toBeNull();
  });

  it("не снимает блокировку после отзыва: это была просьба удалить", async () => {
    await revokeConsent(owner, candidateId);
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentToken: "test-token-revoked",
        consentTokenExpiresAt: new Date(Date.now() + DAY),
      },
    });

    await giveConsent({ token: "test-token-revoked" });

    expect((await stateOf(candidateId))?.erasureState).toBe(
      "BLOCKED_FOR_ERASURE",
    );
  });

  /*
    Продление бывает и вручную: «согласие получено на бумаге» на странице
    кандидата. Без снятия блокировки здесь кандидат остался бы с
    действующим согласием и заблокированным, а через тридцать дней
    очередь уничтожила бы его данные.
  */
  it("ручная отметка рекрутером снимает блокировку по сроку так же", async () => {
    await blockForErasure({
      candidateId,
      organizationId: ORG,
      reason: "CONSENT_EXPIRED",
      actorId: candidateId,
    });

    await markConsentGiven(owner, candidateId);

    const c = await stateOf(candidateId);
    expect(c?.erasureState).toBe("ACTIVE");
    expect(c?.erasureDueAt).toBeNull();
  });

  it("ручная отметка не снимает блокировку после отзыва", async () => {
    await revokeConsent(owner, candidateId);

    await markConsentGiven(owner, candidateId);

    expect((await stateOf(candidateId))?.erasureState).toBe(
      "BLOCKED_FOR_ERASURE",
    );
  });
});

describe("удаление сразу (кнопка владельца)", () => {
  it("закрывает контур: к заявкам обезличенного уже не подойти", async () => {
    const { id } = await addToVacancy(owner, VACANCY, candidateId);
    const stages = await db.pipelineStage.findMany({
      where: { vacancyId: VACANCY },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    await erasePersonalData(owner, candidateId);

    expect((await stateOf(candidateId))?.erasureState).toBe("ANONYMIZED");
    await expect(moveStage(owner, id, stages[1].id)).rejects.toThrow(
      /уничтожены/,
    );
  });
});

describe("очередь и её исполнение", () => {
  it("поставленное в очередь уничтожается ближайшим проходом", async () => {
    await revokeConsent(owner, candidateId);
    await queueErasure(owner, candidateId);

    const result = await runErasureQueue();
    expect(result.обезличено).toBeGreaterThanOrEqual(1);

    const c = await stateOf(candidateId);
    expect(c?.erasureState).toBe("ANONYMIZED");
    expect(c?.phone).toBeNull();
    expect(c?.email).toBeNull();
    expect(c?.fullName).toContain("Кандидат #");
  });

  it("просроченное уничтожается само, без участия человека", async () => {
    await revokeConsent(owner, candidateId);
    await db.candidate.update({
      where: { id: candidateId },
      data: { erasureDueAt: new Date(Date.now() - DAY) },
    });

    await runErasureQueue();

    expect((await stateOf(candidateId))?.erasureState).toBe("ANONYMIZED");
  });

  it("до наступления срока не трогается", async () => {
    await revokeConsent(owner, candidateId);

    await runErasureQueue();

    expect((await stateOf(candidateId))?.erasureState).toBe(
      "BLOCKED_FOR_ERASURE",
    );
  });

  it("истёкшее согласие само попадает под блокировку", async () => {
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentExpiresAt: new Date(Date.now() - DAY) },
    });

    const result = await runErasureQueue();
    expect(result.заблокировано).toBeGreaterThanOrEqual(1);

    const c = await stateOf(candidateId);
    expect(c?.erasureState).toBe("BLOCKED_FOR_ERASURE");
    expect(c?.erasureReason).toBe("CONSENT_EXPIRED");
  });

  it("в очередь нельзя поставить того, у кого нет основания", async () => {
    await expect(queueErasure(owner, candidateId)).rejects.toThrow(ErasureError);
  });
});

describe("список очереди", () => {
  it("показывает срок и сортирует по близости к нарушению", async () => {
    const soon = await makeCandidate();
    await revokeConsent(owner, soon);
    await db.candidate.update({
      where: { id: soon },
      data: { erasureDueAt: new Date(Date.now() + 2 * DAY) },
    });
    await revokeConsent(owner, candidateId);

    const queue = (await listErasureQueue(owner)).filter((i) =>
      i.id.startsWith(PREFIX),
    );

    expect(queue.length).toBe(2);
    expect(queue[0].id, "первым идёт тот, у кого срок ближе").toBe(soon);
    expect(queue[0].daysLeft).toBeLessThanOrEqual(2);
  });
});
