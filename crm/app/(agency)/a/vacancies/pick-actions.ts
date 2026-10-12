"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { ApplicationError } from "@/lib/services/applications";
import {
  addManyToVacancy,
  searchForVacancy,
  type PickerCandidate,
  type PickResult,
} from "@/lib/services/vacancy-picker";

export type PickSearchState = { items: PickerCandidate[]; error?: string };
export type PickAddState = { result?: PickResult; error?: string };

/** Поиск по базе для панели «Подобрать из базы». */
export async function searchForVacancyAction(params: {
  vacancyId: string;
  query?: string;
  city?: string;
  salaryTo?: number;
}): Promise<PickSearchState> {
  const actor = await requireAgencyActor();
  if (!canDo(actor, "application.create")) return { items: [] };

  try {
    const items = await searchForVacancy(actor, params.vacancyId, {
      query: params.query,
      city: params.city,
      salaryTo: params.salaryTo,
    });
    return { items };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { items: [], error: "Недостаточно прав" };
    throw error;
  }
}

/** Посадить отмеченных кандидатов на выбранный внутренний этап. */
export async function addManyToVacancyAction(params: {
  vacancyId: string;
  candidateIds: string[];
  stageId?: string;
}): Promise<PickAddState> {
  const actor = await requireAgencyActor();

  try {
    const result = await addManyToVacancy(
      actor,
      params.vacancyId,
      params.candidateIds,
      params.stageId,
    );
    revalidatePath(`/a/vacancies/${params.vacancyId}`);
    revalidatePath("/a/candidates");
    return { result };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }
}
