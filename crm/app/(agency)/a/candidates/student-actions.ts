"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { ApplicationError } from "@/lib/services/applications";
import {
  offerWorkToStudent,
  sendChatToStudent,
  StudentCandidateError,
} from "@/lib/services/student-candidates";

export type StudentActionState = { error?: string; ok?: string; warning?: string };

const MAX_MESSAGE = 2000;

function fail(error: unknown): StudentActionState {
  if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
  if (error instanceof StudentCandidateError) return { error: error.message };
  if (error instanceof ApplicationError) return { error: error.message };
  throw error;
}

/** Предложить студенту вакансию: в воронку, в журнал, при желании — сообщением в чат. */
export async function offerWorkAction(input: {
  candidateId: string;
  vacancyId: string;
  message: string;
}): Promise<StudentActionState> {
  const actor = await requireAgencyActor();
  if (input.message.length > MAX_MESSAGE) return { error: `Сообщение не длиннее ${MAX_MESSAGE} символов` };

  try {
    const result = await offerWorkToStudent(actor, input.candidateId, input.vacancyId, input.message);
    revalidatePath(`/a/candidates/${input.candidateId}`);
    revalidatePath(`/a/vacancies/${input.vacancyId}`);
    if (input.message.trim() && !result.messageSent) {
      return {
        ok: `Кандидат добавлен в воронку «${result.vacancyTitle}»`,
        warning: `Сообщение студенту не отправлено: ${result.messageError ?? "платформа не ответила"}. Напишите ему из переписки ниже.`,
      };
    }
    return {
      ok: result.messageSent
        ? `Вакансия предложена: кандидат в воронке, студенту отправлено сообщение`
        : `Кандидат добавлен в воронку «${result.vacancyTitle}»`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Сообщение студенту из карточки кандидата. */
export async function sendStudentMessageAction(input: {
  candidateId: string;
  body: string;
}): Promise<StudentActionState> {
  const actor = await requireAgencyActor();
  const body = input.body.trim();
  if (!body) return { error: "Сообщение пустое" };
  if (body.length > MAX_MESSAGE) return { error: `Сообщение не длиннее ${MAX_MESSAGE} символов` };

  try {
    const result = await sendChatToStudent(actor, input.candidateId, body);
    if (!result.ok) return { error: result.error ?? "Сообщение не отправлено" };
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/a/candidates/${input.candidateId}`);
  return { ok: "Отправлено" };
}
