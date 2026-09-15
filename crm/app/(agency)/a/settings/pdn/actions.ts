"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import {
  erasePersonalData,
  RetentionError,
} from "@/lib/services/pdn-retention";

export type PdnState = { error?: string; ok?: string };

/**
 * Физическое удаление персональных данных кандидата (BR-35).
 *
 * Действие необратимо и доступно только владельцу: право на удаление
 * реализуется человеком, а не таймером, и отвечает за него один
 * конкретный человек.
 */
export async function erasePersonalDataAction(
  _prev: PdnState,
  formData: FormData,
): Promise<PdnState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");
  const confirmation = String(formData.get("confirm") || "");

  // Подтверждение словом: необратимое удаление не должно случаться
  // от промаха мышью
  if (confirmation.trim().toLowerCase() !== "удалить") {
    return { error: "Для подтверждения впишите слово «удалить»" };
  }

  try {
    authorizeOrThrow(actor, "pdn.auditLog");
    const { erasedFiles } = await erasePersonalData(actor, candidateId);

    revalidatePath("/a/settings/pdn");
    return {
      ok:
        erasedFiles > 0
          ? `Данные удалены, файлов стёрто: ${erasedFiles}`
          : "Данные удалены",
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Удалять персональные данные может только владелец" };
    }
    if (error instanceof RetentionError) return { error: error.message };
    throw error;
  }
}
