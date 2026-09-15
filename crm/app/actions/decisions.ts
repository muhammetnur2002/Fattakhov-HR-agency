"use server";

import { revalidatePath } from "next/cache";

import { canDo, isAgency } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CLIENT_DECISION_MESSAGES } from "@/lib/labels";
import {
  ApplicationError,
  setClientDecision,
  undoClientRejection,
} from "@/lib/services/applications";
import type { ClientDecision } from "@/lib/generated/prisma/enums";
import { rejectSchema } from "@/lib/validation/candidate";

export type DecisionState = { error?: string; ok?: string };

/**
 * Решение клиента по кандидату (BR-12, BR-13, BR-14).
 *
 * Одно действие на обе стороны. Если его вызывает сотрудник агентства,
 * решение записывается как внесённое со слов клиента и помечается —
 * клиент увидит плашку и сможет оспорить.
 */
export async function decideAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const actor = await requireActor();
  const applicationId = String(formData.get("applicationId") || "");
  const decision = String(formData.get("decision") || "") as ClientDecision;

  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      vacancyId: true,
      vacancy: { select: { clientId: true, hiringManagerId: true } },
    },
  });
  if (!application) return { error: "Кандидат не найден" };

  const onBehalf = isAgency(actor);
  const permission = onBehalf
    ? "application.decideOnBehalf"
    : "application.decide";

  if (!canDo(actor, permission, application.vacancy)) {
    return { error: "Недостаточно прав для решения по кандидату" };
  }

  let rejection;
  if (decision === "REJECT") {
    const parsed = rejectSchema.safeParse({
      rejectionReason: formData.get("rejectionReason"),
      rejectedBy: formData.get("rejectedBy") || "CLIENT",
      rejectionComment: formData.get("rejectionComment") || undefined,
    });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Укажите причину отказа",
      };
    }
    rejection = parsed.data;
  }

  try {
    await setClientDecision(actor, applicationId, decision, {
      rejection,
      onBehalf,
    });
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/a/applications/${applicationId}`);
  // Решение чаще всего принимают со страницы вакансии (сравнение
  // кандидатов), а не с карточки — без этого воронка там показывала
  // старый этап, пока клиент не перезайдёт
  revalidatePath(`/vacancies/${application.vacancyId}`);
  revalidatePath(`/a/vacancies/${application.vacancyId}`);
  return { ok: CLIENT_DECISION_MESSAGES[decision] };
}

/**
 * Отмена отказа — тот же порог прав, что и у самого решения: кто мог
 * отказать, тот может и передумать. Со слов клиента агентством тоже
 * можно (та же логика onBehalf, что и в decideAction).
 */
export async function undoRejectAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const actor = await requireActor();
  const applicationId = String(formData.get("applicationId") || "");

  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      vacancyId: true,
      vacancy: { select: { clientId: true, hiringManagerId: true } },
    },
  });
  if (!application) return { error: "Кандидат не найден" };

  const onBehalf = isAgency(actor);
  const permission = onBehalf
    ? "application.decideOnBehalf"
    : "application.decide";

  if (!canDo(actor, permission, application.vacancy)) {
    return { error: "Недостаточно прав для решения по кандидату" };
  }

  try {
    await undoClientRejection(actor, applicationId);
  } catch (error) {
    if (error instanceof ApplicationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/a/applications/${applicationId}`);
  revalidatePath(`/vacancies/${application.vacancyId}`);
  revalidatePath(`/a/vacancies/${application.vacancyId}`);
  return { ok: "Отказ отменён — кандидат снова в работе" };
}
