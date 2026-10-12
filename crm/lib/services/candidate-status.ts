import { assertCanDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type { CandidateStatus } from "@/lib/generated/prisma/enums";

/**
 * Рабочий статус кандидата в общей базе агентства.
 *
 * Ставится вручную («ждёт клиента», «в резерве», «не актуален» и т.д.) и
 * нужен для списка: по нему рекрутёр отбирает, с кем сейчас работать. На
 * воронки по вакансиям статус не влияет, а вкладка «Ждут клиента» в списке
 * кандидатов по-прежнему считается сама по откликам.
 *
 * Пусто (null) значит «статус не ставили»: у кандидатов, заведённых до
 * появления статусов, его нет, и выдумывать им «Новый» задним числом нельзя.
 */

export class CandidateStatusError extends Error {}

export const CANDIDATE_STATUSES: readonly CandidateStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "RESERVE",
  "HIRED",
  "NOT_RELEVANT",
  "ON_HOLD",
];

/** Значение из формы или адреса: только известный статус, иначе null. */
export function parseCandidateStatus(value: unknown): CandidateStatus | null {
  return typeof value === "string" && (CANDIDATE_STATUSES as readonly string[]).includes(value)
    ? (value as CandidateStatus)
    : null;
}

export async function setCandidateStatus(
  actor: Actor,
  candidateId: string,
  status: CandidateStatus | null,
): Promise<{ from: CandidateStatus | null; to: CandidateStatus | null }> {
  assertCanDo(actor, "application.viewInternal");

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { status: true },
  });
  if (!candidate) throw new CandidateStatusError("Кандидат не найден");
  if (status !== null && !CANDIDATE_STATUSES.includes(status)) {
    throw new CandidateStatusError("Неизвестный статус");
  }
  if (candidate.status === status) return { from: candidate.status, to: status };

  await prisma.candidate.update({ where: { id: candidateId }, data: { status } });
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Candidate",
      entityId: candidateId,
      action: "status_changed",
      diff: { from: candidate.status, to: status },
    },
  });

  return { from: candidate.status, to: status };
}
