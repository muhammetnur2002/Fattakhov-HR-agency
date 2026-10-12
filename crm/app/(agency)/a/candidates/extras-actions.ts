"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { attachFile } from "@/lib/services/candidates";
import { CandidateEditError, describeChangedProfileFields, editCandidateProfile } from "@/lib/services/candidate-edit";
import {
  CandidateFileError,
  deleteCandidateFile,
  fileVisibility,
  parseCandidateFileKind,
} from "@/lib/services/candidate-files";
import { CandidateNoteError, createCandidateComment } from "@/lib/services/candidate-notes";
import {
  CandidateStatusError,
  parseCandidateStatus,
  setCandidateStatus,
} from "@/lib/services/candidate-status";
import { deleteComment, CommentError } from "@/lib/services/comments";
import { SourcingError } from "@/lib/services/sourcing";
import { FileValidationError } from "@/lib/storage";
import { candidateProfileSchema } from "@/lib/validation/candidate";

export type ExtrasState = { error?: string; ok?: string };

function refresh(candidateId: string) {
  revalidatePath(`/a/candidates/${candidateId}`);
  revalidatePath("/a/candidates");
}

/** Смена статуса кандидата (пустое значение снимает статус). */
export async function setCandidateStatusAction(
  candidateId: string,
  status: string,
): Promise<ExtrasState> {
  const actor = await requireAgencyActor();
  const parsed = status === "" ? null : parseCandidateStatus(status);
  if (status !== "" && parsed === null) return { error: "Неизвестный статус" };

  try {
    await setCandidateStatus(actor, candidateId, parsed);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof CandidateStatusError) return { error: error.message };
    throw error;
  }

  refresh(candidateId);
  return { ok: "Статус сохранён" };
}

/** Сохранение профиля целиком: пустое поле стирает значение. */
export async function updateCandidateProfileAction(
  candidateId: string,
  values: Record<string, string>,
): Promise<ExtrasState> {
  const actor = await requireAgencyActor();

  const parsed = candidateProfileSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    const { changed } = await editCandidateProfile(actor, candidateId, parsed.data);
    refresh(candidateId);
    return {
      ok:
        changed.length === 0
          ? "Изменений нет"
          : `Сохранено. Изменено: ${describeChangedProfileFields(changed).join(", ").toLowerCase()}`,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof CandidateEditError || error instanceof SourcingError) {
      return { error: error.message };
    }
    throw error;
  }
}

/** Загрузка файла в карточку кандидата: вид и «показывать клиенту». */
export async function uploadCandidateFileAction(
  _prev: ExtrasState,
  formData: FormData,
): Promise<ExtrasState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");
  const file = formData.get("file");
  const kind = parseCandidateFileKind(formData.get("kind"));

  if (!(file instanceof File) || file.size === 0) return { error: "Выберите файл" };
  if (!kind) return { error: "Выберите вид файла" };

  try {
    const visibility = fileVisibility(kind, formData.get("shareWithClient") === "on");
    await attachFile(actor, { candidateId, file, kind, visibility });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (
      error instanceof FileValidationError ||
      error instanceof SourcingError ||
      error instanceof CandidateFileError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  refresh(candidateId);
  return { ok: "Файл загружен" };
}

export async function deleteCandidateFileAction(attachmentId: string): Promise<ExtrasState> {
  const actor = await requireAgencyActor();
  try {
    const { candidateId } = await deleteCandidateFile(actor, attachmentId);
    refresh(candidateId);
    return { ok: "Файл удалён" };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof CandidateFileError) return { error: error.message };
    throw error;
  }
}

/** Комментарий под кандидатом: заметка в целом, внутренний или показанный работодателю. */
export async function addCandidateCommentAction(
  _prev: ExtrasState,
  formData: FormData,
): Promise<ExtrasState> {
  const actor = await requireAgencyActor();
  const candidateId = String(formData.get("candidateId") || "");

  try {
    await createCandidateComment(actor, {
      candidateId,
      body: String(formData.get("body") || ""),
      applicationId: String(formData.get("applicationId") || "") || undefined,
      shareWithEmployer: formData.get("shareWithEmployer") === "on",
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof CandidateNoteError || error instanceof CommentError) {
      return { error: error.message };
    }
    throw error;
  }

  refresh(candidateId);
  return { ok: "Комментарий добавлен" };
}

export async function deleteCandidateCommentAction(
  candidateId: string,
  commentId: string,
): Promise<ExtrasState> {
  const actor = await requireAgencyActor();
  try {
    await deleteComment(actor, commentId);
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }
  refresh(candidateId);
  return { ok: "Комментарий удалён" };
}
