"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { describeChangedFields, editBriefAsAgency, VacancyBriefError } from "@/lib/services/vacancy-brief-edit";
import { vacancyBriefSchema } from "@/lib/validation/vacancy";

export type BriefEditState = { error?: string; ok?: string };

/**
 * Сохранение брифа сотрудником агентства.
 *
 * Бриф целиком, а не по шагам: здесь правят существующую вакансию, а не
 * заполняют заявку. Пустое поле стирает значение (в отличие от автосохранения
 * мастера), поэтому форма шлёт все поля как есть.
 */
export async function updateVacancyBriefAction(
  vacancyId: string,
  values: Record<string, string>,
): Promise<BriefEditState> {
  const actor = await requireAgencyActor();

  const parsed = vacancyBriefSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    const { changed } = await editBriefAsAgency(actor, vacancyId, parsed.data);
    revalidatePath(`/a/vacancies/${vacancyId}`);
    revalidatePath(`/vacancies/${vacancyId}`);
    return {
      ok:
        changed.length === 0
          ? "Изменений нет"
          : `Сохранено. Изменено: ${describeChangedFields(changed).join(", ").toLowerCase()}`,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof VacancyBriefError) return { error: error.message };
    throw error;
  }
}
