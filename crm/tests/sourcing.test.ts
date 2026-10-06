/**
 * Сорсинг-лид (lib/services/sourcing.ts) — регламент юриста для человека,
 * которого рекрутер нашёл сам: до согласия только имя, контакты и ссылка
 * на профиль, уведомление первым действием, 14 дней, клиенту не передаётся.
 *
 * Проверяются обязанности, а не «функция отработала»: лишнее не сохраняется
 * (и рекрутер видит почему), срок наступает сам и уводит данные в общий
 * контур уничтожения, согласие возвращает кандидата, а тот, кто его завёл,
 * узнаёт о сроке заранее и один раз.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { remindSourcingDeadlines } from "@/jobs/tasks";
import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  attachFile,
  quickCreateCandidate,
  updateCandidateProfile,
} from "@/lib/services/candidates";
import { createConsentLink, giveConsent } from "@/lib/services/consent";
import { ERASURE_DEADLINE_DAYS } from "@/lib/services/erasure";
import { runErasureQueue } from "@/lib/services/pdn-retention";
import {
  isSourcingLead,
  markSourcingNotice,
  restrictedFieldsIn,
  SOURCING_LEAD_TTL_DAYS,
  SourcingError,
  sourcingDaysLeft,
} from "@/lib/services/sourcing";
import { candidateProfileSchema, quickCandidateSchema } from "@/lib/validation/candidate";

const ORG = "org_fattakhov";
const DAY = 86_400_000;

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const NAME = "Сорсинг Тестовый";
const PREFIX = "test_sourcing_";

async function cleanup() {
  const ids = (
    await db.candidate.findMany({
      where: { OR: [{ id: { startsWith: PREFIX } }, { fullName: NAME }] },
      select: { id: true },
    })
  ).map((c) => c.id);
  await db.notification.deleteMany({ where: { eventCode: "SOURCING_EXPIRES_SOON" } });
  if (ids.length === 0) return;
  await db.personalDataAccessLog.deleteMany({ where: { candidateId: { in: ids } } });
  await db.attachment.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

/** Сорсинг-лид, заведённый daysAgo дней назад. */
async function makeLead(daysAgo: number, extra: Record<string, unknown> = {}) {
  const id = `${PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.candidate.create({
    data: {
      id,
      organizationId: ORG,
      fullName: NAME,
      phone: "+70000000001",
      createdById: owner.id,
      sourcedAt: new Date(Date.now() - daysAgo * DAY),
      ...extra,
    },
  });
  return id;
}

/** Ввод правки профиля — через ту же схему, что и форма. */
function profile(fields: Record<string, unknown>) {
  return candidateProfileSchema.parse({ fullName: NAME, ...fields });
}

async function stateOf(id: string) {
  return db.candidate.findUnique({
    where: { id },
    select: {
      erasureState: true,
      erasureReason: true,
      erasureDueAt: true,
      sourcedAt: true,
      sourcingNoticeAt: true,
      sourcingReminderAt: true,
      consentStatus: true,
    },
  });
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(cleanup);

describe("правила режима", () => {
  it("пустые поля формы не считаются заполнением, заполненные называются по-человечески", () => {
    expect(restrictedFieldsIn({ city: "", skills: [], summary: null })).toEqual([]);
    expect(restrictedFieldsIn({ currentPosition: "Логист", salaryExpectation: 150000 })).toEqual([
      "должность",
      "зарплатные ожидания",
    ]);
  });

  it("сорсинг-лид — только пока согласия не было", () => {
    const sourcedAt = new Date();
    expect(isSourcingLead({ sourcedAt, consentStatus: "PENDING" })).toBe(true);
    expect(isSourcingLead({ sourcedAt, consentStatus: "GIVEN" })).toBe(false);
    // Отозванное и истёкшее — забота общего контура уничтожения
    expect(isSourcingLead({ sourcedAt, consentStatus: "REVOKED" })).toBe(false);
    // Заведённые до режима (без отметки) в него не попадают
    expect(isSourcingLead({ sourcedAt: null, consentStatus: "PENDING" })).toBe(false);
  });

  it("срок — 14 дней с заведения", () => {
    expect(SOURCING_LEAD_TTL_DAYS).toBe(14);
    const now = new Date("2026-10-03T12:00:00Z");
    expect(sourcingDaysLeft(new Date("2026-10-03T12:00:00Z"), now)).toBe(14);
    expect(sourcingDaysLeft(new Date("2026-09-19T12:00:00Z"), now)).toBe(0);
  });
});

describe("заведение и правка", () => {
  it("новый кандидат заводится с отметкой и контактами, включая Telegram", async () => {
    // Через ту же схему, что и форма: Telegram без телефона и почты — тоже контакт
    const created = await quickCreateCandidate(
      owner,
      quickCandidateSchema.parse({
        fullName: NAME,
        telegram: "@sourcing_test",
        source: "TELEGRAM",
        sourceDetails: "https://t.me/sourcing_test",
      }),
    );
    const state = await stateOf(created.id);
    expect(state?.sourcedAt).not.toBeNull();
    expect(state?.consentStatus).toBe("PENDING");
  });

  it("поля профиля при заведении отклоняются с объяснением, а не теряются молча", async () => {
    // Так присылает форма, открытая до выкатки: поля профиля ещё в ней
    const attempt = quickCreateCandidate(
      owner,
      quickCandidateSchema.parse({
        fullName: NAME,
        phone: "+70000000002",
        currentPosition: "Логист",
        currentCompany: "ООО Ромашка",
        source: "HH",
      }),
    );
    await expect(attempt).rejects.toThrow(SourcingError);
    await expect(attempt).rejects.toThrow(/должность, компания/);
    expect(await db.candidate.count({ where: { fullName: NAME } })).toBe(0);
  });

  it("до согласия профиль не правится, после согласия — правится", async () => {
    const id = await makeLead(1);
    await expect(
      updateCandidateProfile(owner, id, profile({ city: "Казань" })),
    ).rejects.toThrow(SourcingError);

    await db.candidate.update({
      where: { id },
      data: {
        consentStatus: "GIVEN",
        consentGivenAt: new Date(),
        consentExpiresAt: new Date(Date.now() + 300 * DAY),
      },
    });
    await expect(
      updateCandidateProfile(owner, id, profile({ city: "Казань" })),
    ).resolves.not.toBeNull();
  });

  it("кандидат, заведённый до режима, правится как раньше", async () => {
    const id = await makeLead(0, { sourcedAt: null });
    await expect(
      updateCandidateProfile(owner, id, profile({ city: "Казань" })),
    ).resolves.not.toBeNull();
  });

  it("файл к сорсинг-лиду не сохраняется — и в хранилище не попадает", async () => {
    const id = await makeLead(1);
    const file = new File(["%PDF-1.4 test"], "cv.pdf", { type: "application/pdf" });
    await expect(
      attachFile(owner, { candidateId: id, file, kind: "RESUME" }),
    ).rejects.toThrow(SourcingError);
    expect(await db.attachment.count({ where: { candidateId: id } })).toBe(0);
  });
});

describe("уведомление первым действием", () => {
  it("отметка ставится один раз и попадает в журнал ПДн", async () => {
    const id = await makeLead(1);
    const first = await markSourcingNotice({ candidateId: id, organizationId: ORG, actorId: owner.id });
    const firstAt = (await stateOf(id))?.sourcingNoticeAt;
    const second = await markSourcingNotice({ candidateId: id, organizationId: ORG, actorId: owner.id });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await stateOf(id))?.sourcingNoticeAt).toEqual(firstAt);
    expect(
      await db.personalDataAccessLog.count({
        where: { candidateId: id, action: "sourcing_notice_sent" },
      }),
    ).toBe(2);
  });
});

describe("срок и уничтожение", () => {
  it("без согласия за 14 дней — блокировка с причиной и сроком уничтожения", async () => {
    const expired = await makeLead(SOURCING_LEAD_TTL_DAYS + 1);
    const fresh = await makeLead(5);

    await runErasureQueue();

    const blocked = await stateOf(expired);
    expect(blocked?.erasureState).toBe("BLOCKED_FOR_ERASURE");
    expect(blocked?.erasureReason).toBe("SOURCING_EXPIRED");
    const dueInDays = Math.round(((blocked?.erasureDueAt?.getTime() ?? 0) - Date.now()) / DAY);
    expect(dueInDays).toBe(ERASURE_DEADLINE_DAYS);

    expect((await stateOf(fresh))?.erasureState).toBe("ACTIVE");
  });

  it("с согласием срок сорсинга не действует", async () => {
    const id = await makeLead(SOURCING_LEAD_TTL_DAYS + 5, {
      consentStatus: "GIVEN",
      consentGivenAt: new Date(),
      consentExpiresAt: new Date(Date.now() + 300 * DAY),
    });
    await runErasureQueue();
    expect((await stateOf(id))?.erasureState).toBe("ACTIVE");
  });

  it("согласие по ссылке, пока данные не уничтожены, снимает блокировку", async () => {
    const id = await makeLead(SOURCING_LEAD_TTL_DAYS + 1);
    await runErasureQueue();
    expect((await stateOf(id))?.erasureState).toBe("BLOCKED_FOR_ERASURE");

    const token = await createConsentLink(owner, id);
    await giveConsent({ token });

    const state = await stateOf(id);
    expect(state?.consentStatus).toBe("GIVEN");
    expect(state?.erasureState).toBe("ACTIVE");
    expect(state?.erasureReason).toBeNull();
  });
});

describe("напоминание тому, кто завёл", () => {
  async function remindersFor(userId: string) {
    return db.notification.count({
      where: { userId, eventCode: "SOURCING_EXPIRES_SOON" },
    });
  }

  it("за три дня до срока — одно напоминание, повторный проход второго не шлёт", async () => {
    const soon = await makeLead(SOURCING_LEAD_TTL_DAYS - 2);
    await makeLead(5);

    await remindSourcingDeadlines();
    expect(await remindersFor(owner.id)).toBe(1);
    expect((await stateOf(soon))?.sourcingReminderAt).not.toBeNull();

    await remindSourcingDeadlines();
    expect(await remindersFor(owner.id)).toBe(1);
  });
});
