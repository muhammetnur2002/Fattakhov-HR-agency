"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, canDo } from "@/lib/access";
import { authorizeOrThrow, requireActor } from "@/lib/auth/session";
import { zonedToUtc } from "@/lib/calendar/timezone";
import { prisma } from "@/lib/db/prisma";
import type { InterviewFormat, InterviewStatus } from "@/lib/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";
import { agencySideRecipients } from "@/lib/notifications/recipients";
import {
  findConflicts,
  InterviewError,
  proposeSlots,
  submitFeedback,
  transitionInterview,
} from "@/lib/services/interviews";
import { appOrigin } from "@/lib/urls";

export type InterviewState = {
  error?: string;
  ok?: string;
  /** Ссылка для кандидата — её копирует рекрутер, пока нет рассылки. */
  scheduleUrl?: string;
  /** Предупреждения о накладках (BR-16): показываем, но не блокируем. */
  conflicts?: string[];
};

/**
 * Предложение слотов кандидату.
 *
 * Времена приходят из формы как локальные строки datetime-local
 * в таймзоне, которую выбрал рекрутер. Приводим к UTC по ней, а не
 * по часовому поясу сервера — иначе встречи разъедутся на часы.
 */
export async function proposeSlotsAction(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const actor = await requireActor();
  const interviewId = String(formData.get("interviewId") || "");
  const timezone = String(formData.get("timezone") || "Europe/Moscow");
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const format = String(formData.get("format") || "ONLINE") as InterviewFormat;

  const raw = formData
    .getAll("slot")
    .map(String)
    .filter((v) => v.trim().length > 0);

  if (raw.length === 0) return { error: "Добавьте хотя бы два варианта времени" };

  const slots = raw.map((value) => {
    const startsAt = zonedToUtc(value, timezone);
    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    };
  });

  const participantUserIds = formData.getAll("participantUserIds").map(String);

  try {
    authorizeOrThrow(actor, "interview.proposeSlots");

    const conflicts = await findConflicts(actor, {
      slots,
      participantUserIds,
      excludeInterviewId: interviewId,
    });

    const { token } = await proposeSlots(actor, interviewId, {
      slots,
      format,
      meetingUrl: String(formData.get("meetingUrl") || "") || undefined,
      address: String(formData.get("address") || "") || undefined,
      durationMinutes,
      participantUserIds,
      timezone,
    });

    const baseUrl = appOrigin();

    revalidatePath(`/a/applications/${formData.get("applicationId")}`);

    return {
      ok: "Слоты сохранены. Отправьте ссылку кандидату.",
      scheduleUrl: `${baseUrl}/schedule/${token}`,
      conflicts: conflicts.map(
        (c) =>
          `${formatDateTime(c.startsAt, timezone)} — уже занято встречей с ${c.withWhom}`,
      ),
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }
}

export async function transitionInterviewAction(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const actor = await requireActor();
  const interviewId = String(formData.get("interviewId") || "");
  const to = String(formData.get("to") || "") as InterviewStatus;

  try {
    authorizeOrThrow(actor, "interview.proposeSlots");
    await transitionInterview(actor, interviewId, to, {
      reason: String(formData.get("reason") || ""),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/applications/${formData.get("applicationId")}`);
  // Те же действия теперь доступны прямо из календаря, и он обязан
  // обновиться: иначе встреча остаётся в списке в старом статусе
  revalidatePath("/a/calendar");
  revalidatePath("/calendar");
  return { ok: "Готово" };
}

/**
 * Запрос переноса от клиента (не самой агентской «Предложить время» —
 * той же кнопкой из InterviewSection клиент воспользоваться не может,
 * там право interview.proposeSlots только у агентства). Клиент не
 * назначает новое время сам, а просит рекрутера прислать другие
 * варианты — дальше подхватывает та же задача, что и при первом
 * приглашении на интервью.
 */
export async function requestRescheduleAction(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const actor = await requireActor();
  const interviewId = String(formData.get("interviewId") || "");

  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: actor.organizationId },
    select: {
      id: true,
      vacancyId: true,
      applicationId: true,
      status: true,
      vacancy: { select: { clientId: true, hiringManagerId: true } },
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });
  if (!interview) return { error: "Встреча не найдена" };

  if (!canDo(actor, "application.decide", interview.vacancy)) {
    return { error: "Недостаточно прав" };
  }

  try {
    await transitionInterview(actor, interviewId, "RESCHEDULE_REQUESTED");
  } catch (error) {
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }

  await notify({
    organizationId: actor.organizationId,
    userIds: await agencySideRecipients(interview.vacancyId, actor.id),
    event: "INTERVIEW_SLOTS_REQUESTED",
    title: `Клиент просит перенести интервью: ${interview.application.candidate.fullName}`,
    body: "Подберите и пришлите новые варианты времени.",
    linkUrl: `/a/applications/${interview.applicationId}`,
  });

  revalidatePath(`/calendar`);
  revalidatePath(`/a/calendar`);
  revalidatePath(`/applications/${interview.applicationId}`);
  revalidatePath(`/a/applications/${interview.applicationId}`);
  return { ok: "Запрос отправлен — рекрутер пришлёт новые варианты" };
}

export async function submitFeedbackAction(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const actor = await requireActor();
  const interviewId = String(formData.get("interviewId") || "");
  const rating = Number(formData.get("rating") || 0);

  try {
    await submitFeedback(actor, interviewId, {
      rating,
      note: String(formData.get("note") || ""),
    });
  } catch (error) {
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }

  const applicationId = String(formData.get("applicationId") || "");
  revalidatePath(`/a/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/a/calendar");
  revalidatePath("/calendar");
  return { ok: "Спасибо, записали" };
}

function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
