"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { addToVacancy, ApplicationError } from "@/lib/services/applications";

export type SeatState = { error?: string; ok?: string };

/**
 * «Посадить в вакансию» с карточки кандидата.
 *
 * Тот же сервис, что у «Из базы» внутри вакансии: кандидат встаёт на первый
 * этап воронки. Отдельное действие нужно только ради обновления карточки
 * кандидата: прежнее обновляет страницу вакансии, а здесь человек остаётся
 * на карточке и должен увидеть новую строку в «Участии в воронках».
 */
export async function seatInVacancyAction(input: {
  candidateId: string;
  vacancyId: string;
}): Promise<SeatState> {
  const actor = await requireAgencyActor();

  try {
    authorizeOrThrow(actor, "application.create");
    await addToVacancy(actor, input.vacancyId, input.candidateId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/candidates/${input.candidateId}`);
  revalidatePath(`/a/vacancies/${input.vacancyId}`);
  revalidatePath("/a/candidates");
  return { ok: "Кандидат добавлен в воронку" };
}
