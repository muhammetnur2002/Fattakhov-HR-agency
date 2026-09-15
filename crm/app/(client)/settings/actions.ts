"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { createInvitation, InviteError } from "@/lib/services/invitations";
import { inviteUserSchema } from "@/lib/validation/client";

export type FormState = { error?: string; ok?: string };

/** Приводит поля формы к объекту для zod. */
function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

/**
 * Клиентский администратор зовёт коллегу в свою же компанию.
 *
 * Право `org.manageClientUsers` у CLIENT_ADMIN есть с самого начала
 * (lib/access/index.ts), но экрана для него в кабинете клиента не
 * было вовсе — приглашать коллег мог только агентский аккаунт-менеджер
 * по просьбе клиента.
 *
 * clientId берётся из actor, а не из формы: клиентский администратор
 * не должен даже теоретически суметь подставить чужой clientId и
 * пригласить кого-то в компанию, к которой сам отношения не имеет.
 * Агентская версия этого действия (app/(agency)/a/clients/actions.ts)
 * доверяет clientId из формы ровно потому, что там его подставляет сама
 * страница из URL, а не человек — здесь такой гарантии нет.
 */
export async function inviteTeammateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireClientActor();

  const parsed = inviteUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  if (!actor.clientId) return { error: "Недостаточно прав" };

  try {
    authorizeOrThrow(actor, "org.manageClientUsers", {
      clientId: actor.clientId,
    });

    await createInvitation({
      organizationId: actor.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      clientId: actor.clientId,
      createdById: actor.id,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    if (error instanceof InviteError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/settings");
  return { ok: `Приглашение для ${parsed.data.email} готово — ссылка ниже` };
}
