"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { ErasureError, queueErasure } from "@/lib/services/erasure";
import {
  erasePersonalData,
  RetentionError,
} from "@/lib/services/pdn-retention";

export type PdnState = { error?: string; ok?: string };

/**
 * Физическое удаление персональных данных кандидата (BR-35) — сразу.
 *
 * Действие необратимо и доступно только владельцу, отвечает за него
 * один конкретный человек. Таймер при этом тоже есть: заблокированных
 * по отзыву или истечению согласия очередь уничтожит сама по сроку
 * (runErasureQueue), эта кнопка — чтобы не ждать его.
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
    revalidatePath("/a/candidates");
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

/**
 * Поставить кандидата в очередь на уничтожение.
 *
 * Отличается от кнопки удаления тем, что не требует подтверждения
 * словом: стирает не нажатие, а ближайший проход фоновой задачи (он идёт
 * раз в минуту, так что отменить по сути нельзя), и без нажатия то же
 * случится по сроку — кнопка лишь не ждёт его. Само основание уже
 * возникло: иначе кандидат не был бы заблокирован, и queueErasure
 * без него не пустит. Единственное, что так теряется, — шанс продлить
 * истёкшее согласие; поэтому очередь показывает причину блокировки.
 */
export async function queueErasureAction(
  _prev: PdnState,
  formData: FormData,
): Promise<PdnState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  try {
    authorizeOrThrow(actor, "pdn.auditLog");
    await queueErasure(actor, candidateId);

    revalidatePath("/a/settings/pdn");
    return { ok: "Поставлено в очередь — данные уничтожит ближайший проход задачи" };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Распоряжаться удалением может только владелец" };
    }
    if (error instanceof ErasureError) return { error: error.message };
    throw error;
  }
}
