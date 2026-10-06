import { prisma } from "@/lib/db/prisma";
import { fetchStudentThreads } from "@/lib/students-service";
import {
  buildThreadList,
  type StudentDraft,
  type StudentThreadItem,
} from "@/lib/students-threads";
import type { StudentThreadSummary } from "@/lib/students-service";

/**
 * Черновики сообщений студентам (кабинет клиента → «Студенческая платформа»
 * → «Сообщения»).
 *
 * Хранятся в базе CRM, а не на платформе: студент черновик не видит и никаких
 * уведомлений не получает — запись принадлежит только пользователю CRM.
 * Ключ — пара «пользователь — отклик»: у двух коллег по компании на один
 * отклик два независимых черновика. Принадлежность отклика клиенту здесь
 * не проверяется: это дело действия (app/(client)/students/actions.ts), у
 * которого есть служебный вызов на платформу.
 */

/** Столько же, сколько сообщение на платформе (MESSAGE_MAX_LENGTH): черновик не должен быть длиннее того, что можно отправить. */
export const DRAFT_MAX_LENGTH = 2000;

export class DraftTooLongError extends Error {
  constructor() {
    super(`Черновик не длиннее ${DRAFT_MAX_LENGTH} знаков`);
    this.name = "DraftTooLongError";
  }
}

function toDraft(row: { applicationId: string; body: string; updatedAt: Date }): StudentDraft {
  return { applicationId: row.applicationId, body: row.body, updatedAt: row.updatedAt.toISOString() };
}

/** Все черновики пользователя. */
export async function listStudentDrafts(userId: string): Promise<StudentDraft[]> {
  const rows = await prisma.studentMessageDraft.findMany({
    where: { userId },
    select: { applicationId: true, body: true, updatedAt: true },
  });
  return rows.map(toDraft);
}

export async function getStudentDraft(userId: string, applicationId: string): Promise<StudentDraft | null> {
  const row = await prisma.studentMessageDraft.findFirst({
    where: { userId, applicationId },
    select: { applicationId: true, body: true, updatedAt: true },
  });
  return row ? toDraft(row) : null;
}

/**
 * Сохранить черновик. Пустой (или из одних пробелов) текст удаляет его: так
 * «очистил поле» и «нет черновика» — одно и то же. Текст хранится как есть,
 * без обрезки пробелов по краям: человек мог поставить пробел и продолжить.
 */
export async function saveStudentDraft(userId: string, applicationId: string, body: string): Promise<void> {
  if (body.trim() === "") {
    await deleteStudentDraft(userId, applicationId);
    return;
  }
  if (body.length > DRAFT_MAX_LENGTH) throw new DraftTooLongError();
  await prisma.studentMessageDraft.upsert({
    where: { userId_applicationId: { userId, applicationId } },
    create: { userId, applicationId, body },
    update: { body },
  });
}

export async function deleteStudentDraft(userId: string, applicationId: string): Promise<void> {
  await prisma.studentMessageDraft.deleteMany({ where: { userId, applicationId } });
}

/**
 * Беседы для списка «Сообщения»: платформа отдаёт все отклики клиента, а
 * показываются только беседы с сообщениями или с черновиком этого пользователя.
 * `all` — полный ответ платформы: по нему проверяется, что беседу, открытую
 * по ссылке («Написать студенту»), клиент вправе открывать.
 */
export async function loadEmployerThreadList(
  userId: string,
  clientId: string,
): Promise<{ items: StudentThreadItem[]; all: StudentThreadSummary[] }> {
  const [all, drafts] = await Promise.all([fetchStudentThreads(clientId), listStudentDrafts(userId)]);
  return { items: buildThreadList(all, drafts), all };
}
