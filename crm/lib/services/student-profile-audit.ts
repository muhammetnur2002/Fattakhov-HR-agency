import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";

/**
 * Журнал доступа к персональным данным (BR-36) для студентов платформы.
 *
 * Студентов платформы в таблице кандидатов нет, поэтому `candidateId` — составной
 * идентификатор «student-profile:<id на платформе>»: журнал остаётся одной таблицей
 * и один раздел «Журнал доступа» показывает всё. ФИО студента сюда не пишется —
 * только идентификатор, кто и когда открыл его анкету или контакты.
 */
export const STUDENT_PROFILE_ID_PREFIX = "student-profile:";

export type StudentProfileAccessAction = "student_profile_view" | "student_profile_contacts_view";

/** Повторное открытие той же анкеты тем же сотрудником в это окно в журнал не пишется. */
export const PROFILE_VIEW_DEDUPE_MS = 10 * 60_000;

export async function recordStudentProfileAccess(
  actor: Actor,
  studentId: string,
  action: StudentProfileAccessAction,
  ip?: string,
  options: { dedupeMs?: number } = {},
): Promise<void> {
  const candidateId = `${STUDENT_PROFILE_ID_PREFIX}${studentId}`;
  if (options.dedupeMs) {
    const recent = await prisma.personalDataAccessLog.findFirst({
      where: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId,
        action,
        createdAt: { gte: new Date(Date.now() - options.dedupeMs) },
      },
      select: { id: true },
    });
    if (recent) return;
  }
  await prisma.personalDataAccessLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      candidateId,
      action,
      ip,
    },
  });
}
