import { randomBytes } from "node:crypto";

import { visibleVacanciesFilter, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type {
  InterviewFormat,
  InterviewStatus,
} from "@/lib/generated/prisma/enums";
import { link } from "@/lib/notifications/links";
import { notify } from "@/lib/notifications/notify";
import {
  canTransition,
  InterviewError,
  overlaps,
  SLOT_TOKEN_TTL_DAYS,
  isSlotPast,
  validateSlots,
} from "@/lib/services/interview-status";

export { InterviewError };

/** Токен публичной ссылки для кандидата. Одноразовый по смыслу, гасится после выбора. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Предложение слотов кандидату (BR-15, BR-16).
 *
 * Здесь же выдаётся публичная ссылка: кандидат выбирает время сам,
 * без переписки и без аккаунта в системе. Это главный смысл этапа —
 * согласование в три стороны обычно съедает несколько дней.
 */
export async function proposeSlots(
  actor: Actor,
  interviewId: string,
  params: {
    slots: { startsAt: Date; endsAt: Date }[];
    format: InterviewFormat;
    meetingUrl?: string;
    address?: string;
    durationMinutes: number;
    participantUserIds: string[];
    timezone: string;
  },
) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: actor.organizationId },
    select: { id: true, status: true, applicationId: true },
  });
  if (!interview) throw new InterviewError("Встреча не найдена");

  // Повторное предложение — обычное дело: кандидат молчит, рекрутер
  // присылает другие времена. Это замена предложения, а не переход
  // состояния, поэтому проверяется отдельно от стейт-машины (там
  // переходы статуса в самого себя запрещены намеренно).
  const isReproposal = interview.status === "SLOTS_PROPOSED";
  if (!isReproposal && !canTransition(interview.status, "SLOTS_PROPOSED")) {
    throw new InterviewError(
      "Слоты для этой встречи уже не предлагают — она подтверждена, отменена или проведена",
    );
  }

  validateSlots(params.slots);

  const token = generateToken();
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + SLOT_TOKEN_TTL_DAYS);

  await prisma.$transaction([
    // Старые варианты убираем: кандидат должен видеть только актуальные
    prisma.interviewSlot.deleteMany({ where: { interviewId } }),
    prisma.interviewSlot.createMany({
      data: params.slots.map((s) => ({
        interviewId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
    }),
    prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "SLOTS_PROPOSED",
        format: params.format,
        meetingUrl: params.meetingUrl ?? null,
        address: params.address ?? null,
        durationMinutes: params.durationMinutes,
        participantUserIds: params.participantUserIds,
        timezone: params.timezone,
        candidateToken: token,
        tokenExpiresAt,
        scheduledAt: null,
      },
    }),
  ]);

  return { token };
}

/**
 * Занятость участников на предложенных слотах (BR-16).
 *
 * Возвращает предупреждения, но ничего не запрещает: у людей есть
 * встречи и вне платформы, и решать, накладка это или нет, должен человек.
 */
export async function findConflicts(
  actor: Actor,
  params: {
    slots: { startsAt: Date; endsAt: Date }[];
    participantUserIds: string[];
    excludeInterviewId?: string;
  },
): Promise<{ startsAt: Date; withWhom: string }[]> {
  if (params.participantUserIds.length === 0 || params.slots.length === 0) {
    return [];
  }

  const earliest = new Date(
    Math.min(...params.slots.map((s) => s.startsAt.getTime())),
  );
  const latest = new Date(
    Math.max(...params.slots.map((s) => s.endsAt.getTime())),
  );

  const booked = await prisma.interview.findMany({
    where: {
      organizationId: actor.organizationId,
      status: "CONFIRMED",
      scheduledAt: { gte: earliest, lte: latest },
      ...(params.excludeInterviewId && {
        id: { not: params.excludeInterviewId },
      }),
    },
    select: {
      scheduledAt: true,
      durationMinutes: true,
      participantUserIds: true,
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });

  const conflicts: { startsAt: Date; withWhom: string }[] = [];

  for (const slot of params.slots) {
    for (const other of booked) {
      if (!other.scheduledAt) continue;

      const sharesParticipant = other.participantUserIds.some((id) =>
        params.participantUserIds.includes(id),
      );
      if (!sharesParticipant) continue;

      const otherRange = {
        startsAt: other.scheduledAt,
        endsAt: new Date(
          other.scheduledAt.getTime() + other.durationMinutes * 60_000,
        ),
      };

      if (overlaps(slot, otherRange)) {
        conflicts.push({
          startsAt: slot.startsAt,
          withWhom: other.application.candidate.fullName,
        });
      }
    }
  }

  return conflicts;
}

/** Данные для публичной страницы выбора. Без авторизации — только по токену. */
export async function getInterviewByToken(token: string) {
  const interview = await prisma.interview.findFirst({
    where: {
      OR: [
        // Ссылка ещё активна — кандидат выбирает время
        {
          candidateToken: token,
          tokenExpiresAt: { gt: new Date() },
          status: "SLOTS_PROPOSED",
        },
        // Время уже выбрано: по той же ссылке кандидат должен видеть,
        // на когда он записан, а не «ссылка недействительна»
        { lastCandidateToken: token, status: "CONFIRMED" },
      ],
    },
    select: {
      id: true,
      status: true,
      format: true,
      durationMinutes: true,
      timezone: true,
      meetingUrl: true,
      address: true,
      scheduledAt: true,
      participantUserIds: true,
      slots: { orderBy: { startsAt: "asc" } },
      vacancy: {
        select: { title: true, client: { select: { name: true } } },
      },
      application: {
        select: { candidate: { select: { fullName: true } } },
      },
    },
  });

  if (!interview) return null;

  // Кандидату показываем, кто будет на встрече: это снимает половину
  // тревоги перед интервью
  const participants = await prisma.user.findMany({
    where: { id: { in: interview.participantUserIds } },
    select: { fullName: true, position: true },
  });

  return { ...interview, participants };
}

/** Кандидат выбрал время. Токен после этого больше не работает. */
export async function confirmSlot(token: string, slotId: string) {
  const interview = await prisma.interview.findFirst({
    where: {
      candidateToken: token,
      tokenExpiresAt: { gt: new Date() },
      status: "SLOTS_PROPOSED",
    },
    select: { id: true, status: true, slots: true },
  });
  if (!interview) throw new InterviewError("Ссылка недействительна или истекла");

  const slot = interview.slots.find((s) => s.id === slotId);
  if (!slot) throw new InterviewError("Такого варианта нет");
  if (isSlotPast(slot.startsAt)) {
    throw new InterviewError("Это время уже прошло — попросите новые варианты");
  }

  await prisma.$transaction([
    prisma.interviewSlot.updateMany({
      where: { interviewId: interview.id },
      data: { isSelected: false },
    }),
    prisma.interviewSlot.update({
      where: { id: slotId },
      data: { isSelected: true },
    }),
    prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: "CONFIRMED",
        scheduledAt: slot.startsAt,
        // Гасим ссылку: повторно менять время через неё нельзя,
        // перенос идёт через рекрутера. Но сам токен запоминаем —
        // по нему кандидат скачает .ics с экрана подтверждения
        candidateToken: null,
        lastCandidateToken: token,
        tokenExpiresAt: null,
      },
    }),
  ]);

  // Обе стороны узнают, что время выбрано, — это то, чего все ждали
  const full = await prisma.interview.findFirst({
    where: { id: interview.id },
    select: {
      organizationId: true,
      vacancyId: true,
      applicationId: true,
      timezone: true,
      participantUserIds: true,
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });

  if (full) {
    await notify({
      organizationId: full.organizationId,
      // Тем, кого позвали на встречу: у них она появится в календаре
      userIds: full.participantUserIds,
      event: "INTERVIEW_CONFIRMED",
      title: `Интервью назначено: ${full.application.candidate.fullName}`,
      body: formatWhen(slot.startsAt, full.timezone),
      linkUrl: link.application(full.applicationId),
    });
  }

  return { interviewId: interview.id, scheduledAt: slot.startsAt };
}

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** Кандидату не подошёл ни один вариант — возвращаем задачу рекрутеру. */
export async function requestOtherSlots(token: string, note: string) {
  const interview = await prisma.interview.findFirst({
    where: {
      candidateToken: token,
      tokenExpiresAt: { gt: new Date() },
      status: "SLOTS_PROPOSED",
    },
    select: { id: true },
  });
  if (!interview) throw new InterviewError("Ссылка недействительна или истекла");

  await prisma.$transaction([
    prisma.interviewSlot.deleteMany({ where: { interviewId: interview.id } }),
    prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: "SLOTS_REQUESTED",
        candidateToken: null,
        tokenExpiresAt: null,
        cancelReason: note.trim() || null,
      },
    }),
  ]);

  return { interviewId: interview.id };
}

/** Смена статуса из кабинета: перенос, отмена, отметка о неявке. */
export async function transitionInterview(
  actor: Actor,
  interviewId: string,
  to: InterviewStatus,
  options: { reason?: string } = {},
) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: actor.organizationId },
    select: { id: true, status: true },
  });
  if (!interview) throw new InterviewError("Встреча не найдена");

  if (!canTransition(interview.status, to)) {
    throw new InterviewError("Такой переход для встречи не предусмотрен");
  }

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: to,
      ...(to === "CANCELLED" && {
        cancelledAt: new Date(),
        cancelReason: options.reason?.trim() || null,
        candidateToken: null,
      }),
      // Перенос и неявка снимают подтверждённое время, иначе встреча
      // остаётся висеть в календаре
      ...((to === "RESCHEDULE_REQUESTED" || to === "SLOTS_REQUESTED") && {
        scheduledAt: null,
        candidateToken: null,
      }),
    },
  });

  return { from: interview.status, to };
}

/** Обратная связь после встречи. */
export async function submitFeedback(
  actor: Actor,
  interviewId: string,
  params: { rating: number; note?: string },
) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: actor.organizationId },
    select: { id: true, status: true },
  });
  if (!interview) throw new InterviewError("Встреча не найдена");

  if (interview.status !== "COMPLETED" && interview.status !== "CONFIRMED") {
    throw new InterviewError("Обратная связь возможна после встречи");
  }
  if (params.rating < 1 || params.rating > 5) {
    throw new InterviewError("Оценка от 1 до 5");
  }

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: "COMPLETED",
      feedbackRating: params.rating,
      feedbackNote: params.note?.trim() || null,
      feedbackById: actor.id,
      feedbackAt: new Date(),
    },
  });
}

export type CalendarRange = { from: Date; to: Date };

/**
 * Встречи для календаря.
 *
 * Клиент видит только свои: фильтр по вакансиям через слой доступа,
 * а не отдельным условием здесь.
 */
export async function listInterviews(
  actor: Actor,
  range: CalendarRange,
  filters: { vacancyId?: string } = {},
) {
  return prisma.interview.findMany({
    where: {
      organizationId: actor.organizationId,
      vacancy: visibleVacanciesFilter(actor),
      ...(filters.vacancyId && { vacancyId: filters.vacancyId }),
      OR: [
        { scheduledAt: { gte: range.from, lte: range.to } },
        // Встречи без времени тоже показываем: это задача, а не событие.
        // RESCHEDULE_REQUESTED сюда же — перенос тоже сбрасывает scheduledAt
        // (см. transitionInterview), и без этого статуса встреча пропадала
        // из календаря совсем, а не переезжала в «ждут согласования»
        {
          scheduledAt: null,
          status: { in: ["SLOTS_REQUESTED", "SLOTS_PROPOSED", "RESCHEDULE_REQUESTED"] },
        },
      ],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      status: true,
      format: true,
      scheduledAt: true,
      durationMinutes: true,
      timezone: true,
      meetingUrl: true,
      address: true,
      participantUserIds: true,
      feedbackRating: true,
      applicationId: true,
      application: {
        select: { candidate: { select: { id: true, fullName: true } } },
      },
      vacancy: {
        select: {
          id: true,
          number: true,
          title: true,
          client: { select: { name: true } },
        },
      },
    },
  });
}

/**
 * Прошедшие встречи, по которым не записали, как всё прошло.
 *
 * Календарь смотрит вперёд, от сегодняшнего дня, и вчерашнее интервью
 * из него исчезает вместе с задачей «зафиксировать результат». Дальше
 * оценка либо не появляется вовсе, либо её ищут по карточкам кандидатов
 * вручную. Здесь тот же список задач, только назад: встреча, которая
 * состоялась и молчит о результате.
 *
 * Неделя — не круглое число, а срок, после которого вспоминать
 * подробности разговора уже поздно.
 */
export async function listUnratedInterviews(
  actor: Actor,
  since: Date,
  filters: { vacancyId?: string } = {},
) {
  return prisma.interview.findMany({
    where: {
      organizationId: actor.organizationId,
      vacancy: visibleVacanciesFilter(actor),
      ...(filters.vacancyId && { vacancyId: filters.vacancyId }),
      status: { in: ["CONFIRMED", "COMPLETED"] },
      feedbackRating: null,
      scheduledAt: { gte: since, lt: new Date() },
    },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      format: true,
      scheduledAt: true,
      durationMinutes: true,
      timezone: true,
      meetingUrl: true,
      address: true,
      participantUserIds: true,
      feedbackRating: true,
      applicationId: true,
      application: {
        select: { candidate: { select: { id: true, fullName: true } } },
      },
      vacancy: {
        select: {
          id: true,
          number: true,
          title: true,
          client: { select: { name: true } },
        },
      },
    },
  });
}

/** Встречи по конкретному кандидату — для его карточки. */
export async function listApplicationInterviews(
  actor: Actor,
  applicationId: string,
) {
  return prisma.interview.findMany({
    where: {
      applicationId,
      organizationId: actor.organizationId,
      vacancy: visibleVacanciesFilter(actor),
    },
    orderBy: { createdAt: "desc" },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });
}
