"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { signOut } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  AccountDeletionError,
  cancelDeletionRequest,
  deleteOwnAccount,
} from "@/lib/services/account-deletion";
import { listClientTeam } from "@/lib/services/clients";
import { actOnEmployerVacancy, fetchEmployerVacancies } from "@/lib/students-service";
import { createInvitation, InviteError } from "@/lib/services/invitations";
import { inviteUserSchema } from "@/lib/validation/client";

export type FormState = { error?: string; ok?: string };

/**
 * Потолок на команду клиента: активные пользователи плюс ещё не принятые
 * приглашения — иначе счётчик легко обойти, наштамповав приглашений
 * без единого принятого.
 */
const MAX_CLIENT_TEAM_SIZE = 5;

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

    const team = await listClientTeam(actor.clientId);
    if (team.users.length + team.invitations.length >= MAX_CLIENT_TEAM_SIZE) {
      return {
        error: `В команде уже ${MAX_CLIENT_TEAM_SIZE} человек, считая ждущих приглашение. ` +
          `Чтобы позвать ещё одного, сначала отключите кого-то из текущих.`,
      };
    }

    await createInvitation({
      organizationId: actor.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      clientId: actor.clientId,
      position: parsed.data.position,
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
  return { ok: `Письмо со ссылкой отправлено на ${parsed.data.email}` };
}

/**
 * Клиент удаляет свой аккаунт. Без договора — сразу и насовсем (выход на страницу входа),
 * с договором — запрос владельцу агентства: аккаунт работает, пока тот не подтвердит.
 */
export async function deleteAccountAction(): Promise<FormState> {
  const actor = await requireClientActor();
  let outcome;
  try {
    outcome = await deleteOwnAccount(actor);
  } catch (error) {
    if (error instanceof AccountDeletionError) return { error: error.message };
    throw error;
  }

  if (outcome.result === "requested") {
    revalidatePath("/settings");
    return { ok: "Запрос отправлен владельцу агентства. Пока он не подтвердит, аккаунт работает как обычно." };
  }

  // Последний сотрудник ушёл — компания остаётся в базе агентства архивной, а её вакансии на
  // студенческой платформе снимаются: иначе студенты продолжали бы откликаться в пустоту
  if (outcome.wasLastUser && actor.clientId) {
    await prisma.client.updateMany({ where: { id: actor.clientId, status: { not: "ACTIVE" } }, data: { status: "ARCHIVED" } });
    try {
      const vacancies = await fetchEmployerVacancies(actor.clientId);
      for (const v of vacancies) {
        if (v.status === "PUBLISHED" || v.status === "PENDING") {
          await actOnEmployerVacancy(v.id, { crmClientId: actor.clientId, actor: "Удаление аккаунта", action: "close", keep: false });
        }
      }
    } catch {
      /* платформа недоступна — вакансии снимет агентство вручную */
    }
  }

  await signOut({ redirectTo: "/login?deleted=1" });
  return { ok: "Аккаунт удалён" };
}

/** Клиент передумал: снять запрос на удаление аккаунта. */
export async function cancelDeletionRequestAction(): Promise<FormState> {
  const actor = await requireClientActor();
  await cancelDeletionRequest(actor);
  revalidatePath("/settings");
  return { ok: "Запрос снят" };
}
