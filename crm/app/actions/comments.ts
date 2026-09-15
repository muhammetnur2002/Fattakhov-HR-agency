"use server";

import { revalidatePath } from "next/cache";

import { canDo } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  CommentError,
  createComment,
  deleteComment,
  editComment,
  markCommentsRead,
} from "@/lib/services/comments";

export type CommentState = { error?: string; ok?: string };

/**
 * Действия по комментариям общие для обоих кабинетов: и рекрутер,
 * и клиент пишут в один тред. Разницу делает слой прав, а не отдельные
 * копии кода для каждой стороны.
 */
export async function createCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const actor = await requireActor();

  const applicationId = String(formData.get("applicationId") || "") || undefined;
  const vacancyId = String(formData.get("vacancyId") || "") || undefined;
  const body = String(formData.get("body") || "");
  const parentId = String(formData.get("parentId") || "") || undefined;
  const internal = formData.get("internal") === "on";

  // Кому принадлежит объект — нужно для проверки прав клиентских ролей
  const subject = await loadSubject({ applicationId, vacancyId });
  if (!subject) return { error: "Не найдено" };

  const action = internal ? "comment.writeInternal" : "comment.writeShared";
  if (!canDo(actor, action, subject)) {
    return { error: "Недостаточно прав для этого комментария" };
  }

  try {
    await createComment(actor, {
      applicationId,
      vacancyId,
      body,
      visibility: internal ? "INTERNAL" : "SHARED",
      parentId,
      mentionedUserIds: formData.getAll("mentionedUserIds").map(String),
    });
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }

  revalidateFor({ applicationId, vacancyId });
  return { ok: "Отправлено" };
}

export async function editCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const actor = await requireActor();
  const commentId = String(formData.get("commentId") || "");
  const body = String(formData.get("body") || "");

  if (!body.trim()) return { error: "Пустой комментарий" };

  try {
    await editComment(actor, commentId, body);
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }

  revalidateFor({
    applicationId: String(formData.get("applicationId") || "") || undefined,
    vacancyId: String(formData.get("vacancyId") || "") || undefined,
  });
  return { ok: "Изменено" };
}

export async function deleteCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const actor = await requireActor();
  const commentId = String(formData.get("commentId") || "");

  try {
    await deleteComment(actor, commentId);
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }

  revalidateFor({
    applicationId: String(formData.get("applicationId") || "") || undefined,
    vacancyId: String(formData.get("vacancyId") || "") || undefined,
  });
  return { ok: "Удалено" };
}

/** Отметка прочтения. Вызывается при открытии карточки, ответа не ждём. */
export async function markReadAction(commentIds: string[]): Promise<void> {
  const actor = await requireActor();
  await markCommentsRead(actor, commentIds);
}

async function loadSubject(params: {
  applicationId?: string;
  vacancyId?: string;
}) {
  if (params.applicationId) {
    const application = await prisma.application.findFirst({
      where: { id: params.applicationId },
      select: {
        vacancy: { select: { clientId: true, hiringManagerId: true } },
      },
    });
    return application?.vacancy ?? null;
  }

  if (params.vacancyId) {
    return prisma.vacancy.findFirst({
      where: { id: params.vacancyId },
      select: { clientId: true, hiringManagerId: true },
    });
  }

  return null;
}

/** Тред виден с четырёх адресов сразу — обновляем все. */
function revalidateFor(params: { applicationId?: string; vacancyId?: string }) {
  if (params.applicationId) {
    revalidatePath(`/applications/${params.applicationId}`);
    revalidatePath(`/a/applications/${params.applicationId}`);
  }
  if (params.vacancyId) {
    revalidatePath(`/vacancies/${params.vacancyId}`);
    revalidatePath(`/a/vacancies/${params.vacancyId}`);
  }
}
