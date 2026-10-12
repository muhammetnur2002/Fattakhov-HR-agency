import { assertCanDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";

/**
 * Файлы кандидата: загрузка идёт через `attachFile` (candidates.ts), здесь удаление.
 *
 * Удаление мягкое (`deletedAt`): запись остаётся для журнала, из списков и по
 * подписанным ссылкам файл исчезает. Физическую очистку хранилища делает
 * общий контур сроков хранения персональных данных (pdn-retention).
 */

export class CandidateFileError extends Error {}

/** Что можно загрузить в карточку кандидата вручную. */
export const CANDIDATE_FILE_KINDS = ["RESUME", "PORTFOLIO", "TEST_TASK", "OTHER"] as const;
export type CandidateFileKind = (typeof CANDIDATE_FILE_KINDS)[number];

export function parseCandidateFileKind(value: unknown): CandidateFileKind | null {
  return typeof value === "string" && (CANDIDATE_FILE_KINDS as readonly string[]).includes(value)
    ? (value as CandidateFileKind)
    : null;
}

/**
 * Видимость файла клиенту по виду файла.
 *
 * Исходное резюме клиенту не отдаётся никогда (P0-5, слой доступа), поэтому
 * пометка «показывать клиенту» для него не принимается, а не молча игнорируется.
 */
export function fileVisibility(kind: CandidateFileKind, shareWithClient: boolean): "INTERNAL" | "SHARED" {
  if (!shareWithClient) return "INTERNAL";
  if (kind === "RESUME") {
    throw new CandidateFileError("Исходное резюме клиенту не передаётся");
  }
  return "SHARED";
}

export async function deleteCandidateFile(actor: Actor, attachmentId: string): Promise<{ candidateId: string }> {
  assertCanDo(actor, "application.viewInternal");

  const file = await prisma.attachment.findFirst({
    where: { id: attachmentId, organizationId: actor.organizationId, candidateId: { not: null }, deletedAt: null },
    select: { id: true, candidateId: true, kind: true },
  });
  if (!file || !file.candidateId) throw new CandidateFileError("Файл не найден");

  await prisma.attachment.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Candidate",
      entityId: file.candidateId,
      action: "file_deleted",
      diff: { kind: file.kind },
    },
  });

  return { candidateId: file.candidateId };
}
