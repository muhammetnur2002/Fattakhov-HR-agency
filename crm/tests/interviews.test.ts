/**
 * Трёхстороннее согласование времени (сценарий C).
 *
 * Проверяется то, ради чего этап делался: рекрутер предлагает слоты,
 * кандидат выбирает по ссылке без аккаунта, ссылка после этого
 * перестаёт работать.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  confirmSlot,
  findConflicts,
  getInterviewByToken,
  InterviewError,
  proposeSlots,
  requestOtherSlots,
  submitFeedback,
  transitionInterview,
} from "@/lib/services/interviews";

const ORG = "org_fattakhov";
const PREFIX = "test_int_";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

let interviewId: string;
let applicationId: string;

/** Слот через N дней от сегодня — чтобы тесты не протухали. */
function futureSlot(days: number, hour: number) {
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1, 0, 0, 0);
  return { startsAt: start, endsAt: end };
}

const proposeParams = {
  format: "ONLINE" as const,
  meetingUrl: "https://telemost.yandex.ru/j/test",
  durationMinutes: 60,
  participantUserIds: ["usr_cl_hiring1"],
  timezone: "Europe/Moscow",
};

async function cleanup() {
  const ids = (
    await db.interview.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((i) => i.id);
  if (ids.length === 0) return;

  await db.interviewSlot.deleteMany({ where: { interviewId: { in: ids } } });
  await db.interview.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  await cleanup();

  // Берём любую представленную заявку: встреча всегда висит на кандидате
  const application = await db.application.findFirst({
    where: { presentedAt: { not: null } },
    select: { id: true, vacancyId: true },
  });
  if (!application) throw new Error("в seed нет представленных кандидатов");

  applicationId = application.id;
  interviewId = `${PREFIX}${Date.now()}`;

  await db.interview.create({
    data: {
      id: interviewId,
      organizationId: ORG,
      applicationId: application.id,
      vacancyId: application.vacancyId,
      type: "CLIENT",
      status: "SLOTS_REQUESTED",
      createdById: recruiter.id,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("предложение слотов", () => {
  it("создаёт варианты и выдаёт ссылку для кандидата", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14), futureSlot(3, 11)],
    });

    expect(token).toBeTruthy();

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, tokenExpiresAt: true, slots: true },
    });

    expect(interview?.status).toBe("SLOTS_PROPOSED");
    expect(interview?.slots).toHaveLength(3);
    expect(interview?.tokenExpiresAt).not.toBeNull();
  });

  it("повторное предложение заменяет старые варианты, а не копит их", async () => {
    await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });
    await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(5, 10), futureSlot(5, 14), futureSlot(6, 10)],
    });

    const count = await db.interviewSlot.count({ where: { interviewId } });
    expect(count).toBe(3);
  });

  it("один вариант не принимается (BR-15)", async () => {
    await expect(
      proposeSlots(recruiter, interviewId, {
        ...proposeParams,
        slots: [futureSlot(2, 10)],
      }),
    ).rejects.toThrow(InterviewError);
  });
});

describe("выбор времени кандидатом", () => {
  it("страница по ссылке показывает вакансию, компанию и участников", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });

    const view = await getInterviewByToken(token);

    expect(view?.vacancy.title).toBeTruthy();
    expect(view?.vacancy.client.name).toBeTruthy();
    expect(view?.slots).toHaveLength(2);
    // Кандидату важно знать, кто будет на встрече
    expect(view?.participants.length).toBeGreaterThan(0);
  });

  it("выбор фиксирует время и гасит ссылку", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });

    const view = await getInterviewByToken(token);
    const chosen = view!.slots[1];

    const result = await confirmSlot(token, chosen.id);
    expect(result.scheduledAt.getTime()).toBe(chosen.startsAt.getTime());

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, scheduledAt: true, candidateToken: true },
    });

    expect(interview?.status).toBe("CONFIRMED");
    expect(interview?.scheduledAt).not.toBeNull();
    // Повторно менять время по той же ссылке нельзя — только через рекрутера
    expect(interview?.candidateToken).toBeNull();
  });

  it("ссылка не работает повторно", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });

    const view = await getInterviewByToken(token);
    await confirmSlot(token, view!.slots[0].id);

    await expect(confirmSlot(token, view!.slots[1].id)).rejects.toThrow(
      /недействительна/,
    );
  });

  it("истёкшая ссылка не открывается", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });

    await db.interview.update({
      where: { id: interviewId },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getInterviewByToken(token)).toBeNull();
  });

  it("выдуманный токен ничего не открывает", async () => {
    expect(await getInterviewByToken("подобранный-токен")).toBeNull();
  });

  it("«ни один не подходит» возвращает задачу рекрутеру", async () => {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });

    await requestOtherSlots(token, "Могу только после 19:00");

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, cancelReason: true, slots: true },
    });

    expect(interview?.status).toBe("SLOTS_REQUESTED");
    expect(interview?.cancelReason).toContain("19:00");
    // Старые варианты убраны — предлагать заново
    expect(interview?.slots).toHaveLength(0);
  });
});

describe("накладки у участников (BR-16)", () => {
  it("занятое время участника попадает в предупреждения", async () => {
    const slot = futureSlot(2, 10);

    // Уже подтверждённая встреча того же человека в то же время
    const busyId = `${PREFIX}busy_${Date.now()}`;
    await db.interview.create({
      data: {
        id: busyId,
        organizationId: ORG,
        applicationId,
        vacancyId: (await db.application.findUniqueOrThrow({
          where: { id: applicationId },
          select: { vacancyId: true },
        })).vacancyId,
        type: "CLIENT",
        status: "CONFIRMED",
        scheduledAt: slot.startsAt,
        durationMinutes: 60,
        participantUserIds: ["usr_cl_hiring1"],
        createdById: recruiter.id,
      },
    });

    const conflicts = await findConflicts(recruiter, {
      slots: [slot],
      participantUserIds: ["usr_cl_hiring1"],
      excludeInterviewId: interviewId,
    });

    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("чужая занятость не считается накладкой", async () => {
    const conflicts = await findConflicts(recruiter, {
      slots: [futureSlot(2, 10)],
      participantUserIds: ["usr_cl_hiring2"],
      excludeInterviewId: interviewId,
    });

    expect(conflicts).toHaveLength(0);
  });
});

describe("перенос, отмена, обратная связь", () => {
  async function confirmed() {
    const { token } = await proposeSlots(recruiter, interviewId, {
      ...proposeParams,
      slots: [futureSlot(2, 10), futureSlot(2, 14)],
    });
    const view = await getInterviewByToken(token);
    await confirmSlot(token, view!.slots[0].id);
  }

  it("перенос снимает подтверждённое время", async () => {
    await confirmed();
    await transitionInterview(recruiter, interviewId, "RESCHEDULE_REQUESTED");

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, scheduledAt: true },
    });

    expect(interview?.status).toBe("RESCHEDULE_REQUESTED");
    // Иначе отменённая встреча осталась бы висеть в календаре
    expect(interview?.scheduledAt).toBeNull();
  });

  it("отмена фиксирует причину", async () => {
    await confirmed();
    await transitionInterview(recruiter, interviewId, "CANCELLED", {
      reason: "Вакансия закрыта внутренним переводом",
    });

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, cancelReason: true, cancelledAt: true },
    });

    expect(interview?.status).toBe("CANCELLED");
    expect(interview?.cancelReason).toContain("переводом");
    expect(interview?.cancelledAt).not.toBeNull();
  });

  it("отменённую встречу нельзя воскресить", async () => {
    await confirmed();
    await transitionInterview(recruiter, interviewId, "CANCELLED");

    await expect(
      transitionInterview(recruiter, interviewId, "CONFIRMED"),
    ).rejects.toThrow(/не предусмотрен/);
  });

  it("обратная связь закрывает встречу", async () => {
    await confirmed();
    await submitFeedback(recruiter, interviewId, {
      rating: 4,
      note: "Сильный по продажам, слабее по аналитике",
    });

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, feedbackRating: true, feedbackById: true },
    });

    expect(interview?.status).toBe("COMPLETED");
    expect(interview?.feedbackRating).toBe(4);
    expect(interview?.feedbackById).toBe(recruiter.id);
  });

  it("оценка вне шкалы не принимается", async () => {
    await confirmed();
    await expect(
      submitFeedback(recruiter, interviewId, { rating: 9 }),
    ).rejects.toThrow(/от 1 до 5/);
  });
});
