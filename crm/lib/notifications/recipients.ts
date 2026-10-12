import { prisma } from "@/lib/db/prisma";
import type { StaffGrant } from "@/lib/access";

/**
 * Кому уходит уведомление по вакансии.
 *
 * Собрано в одном месте, потому что правило неочевидное и повторяется:
 * со стороны клиента это администраторы и заказчик именно этой вакансии,
 * но не заказчики соседних; со стороны агентства — ведущий рекрутер,
 * команда и аккаунт-менеджер клиента.
 *
 * Автор события всегда исключается: уведомлять человека о том, что он
 * только что сделал сам, — верный способ приучить игнорировать уведомления.
 */

export async function clientSideRecipients(
  vacancyId: string,
  exceptUserId?: string,
): Promise<string[]> {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId },
    select: { clientId: true, hiringManagerId: true },
  });
  if (!vacancy) return [];

  const users = await prisma.user.findMany({
    where: {
      clientId: vacancy.clientId,
      isActive: true,
      OR: [
        { role: "CLIENT_ADMIN" },
        ...(vacancy.hiringManagerId ? [{ id: vacancy.hiringManagerId }] : []),
      ],
    },
    select: { id: true },
  });

  return users.map((u) => u.id).filter((id) => id !== exceptUserId);
}

/**
 * Клиентская сторона сразу нескольких вакансий — для сводки.
 *
 * clientSideRecipients отвечает про одну вакансию: администраторы
 * клиента плюс её нанимающий менеджер. Сводка — про другое: одно
 * письмо обо всех активных вакансиях клиента сразу, а нанимающий
 * менеджер у каждой вакансии обычно свой. Взять получателей одной
 * вакансии и разослать всем по остальным значило бы пропустить
 * менеджеров тех вакансий, что не попали в выборку первыми.
 */
export async function clientDigestRecipients(
  vacancyIds: string[],
): Promise<string[]> {
  const perVacancy = await Promise.all(
    vacancyIds.map((id) => clientSideRecipients(id)),
  );
  return [...new Set(perVacancy.flat())];
}

export async function agencySideRecipients(
  vacancyId: string,
  exceptUserId?: string,
): Promise<string[]> {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId },
    select: {
      leadRecruiterId: true,
      recruiterIds: true,
      client: { select: { accountManagerId: true } },
    },
  });
  if (!vacancy) return [];

  const ids = new Set<string>(vacancy.recruiterIds);
  if (vacancy.leadRecruiterId) ids.add(vacancy.leadRecruiterId);
  if (vacancy.client.accountManagerId) ids.add(vacancy.client.accountManagerId);

  return [...ids].filter((id) => id !== exceptUserId);
}

/**
 * Кто видит события студенческой платформы: владелец всегда, сотрудник —
 * если ему выдан конкретный раздел (см. StaffGrant, lib/access). Событие
 * приходит служебным вызовом снаружи, поэтому получатели ищутся по
 * организации целиком, а не по одной вакансии/заявке.
 */
export async function studentsGrantRecipients(
  organizationId: string,
  grant: StaffGrant,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [{ role: "OWNER" }, { grants: { has: grant } }],
    },
    select: { id: true },
  });

  return users.map((u) => u.id);
}

/** Кто принимает новые заявки: руководитель подбора и аккаунт-менеджеры. */
export async function intakeRecipients(
  organizationId: string,
  exceptUserId?: string,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { in: ["HEAD", "ACCOUNT", "OWNER"] },
    },
    select: { id: true },
  });

  return users.map((u) => u.id).filter((id) => id !== exceptUserId);
}

/**
 * Участники обсуждения по кандидату.
 *
 * Для внутреннего комментария — только агентство: иначе внутренняя
 * заметка о клиенте уедет клиенту же уведомлением (BR-3).
 */
export async function threadRecipients(params: {
  vacancyId: string;
  internal: boolean;
  exceptUserId: string;
}): Promise<string[]> {
  const agency = await agencySideRecipients(
    params.vacancyId,
    params.exceptUserId,
  );
  if (params.internal) return agency;

  const client = await clientSideRecipients(
    params.vacancyId,
    params.exceptUserId,
  );
  return [...new Set([...agency, ...client])];
}

/**
 * Клиентская сторона студенческой платформы: администраторы и нанимающие
 * менеджеры клиента — те же роли, которым открыт раздел «Студенческая
 * платформа» (право students.enterAsClient).
 */
export async function studentsClientRecipients(clientId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      clientId,
      isActive: true,
      role: { in: ["CLIENT_ADMIN", "CLIENT_HIRING"] },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Кому сообщить, что студент ответил агентству: кто завёл кандидата, кто ведёт его
 * воронки и кто писал ему из CRM. Только активные сотрудники агентства. Если никого
 * из них не нашлось (всех отключили), сообщение получают владелец и руководитель.
 */
export async function studentReplyRecipients(
  organizationId: string,
  studentId: string,
): Promise<{ candidateId: string; fullName: string; userIds: string[] } | null> {
  const candidate = await prisma.candidate.findFirst({
    where: { organizationId, studentPlatformId: studentId },
    select: {
      id: true,
      fullName: true,
      createdById: true,
      applications: { where: { outcome: "IN_PROGRESS" }, select: { ownerId: true } },
    },
  });
  if (!candidate) return null;

  const senders = await prisma.activityLog.findMany({
    where: {
      organizationId,
      entityType: "Candidate",
      entityId: candidate.id,
      action: "student_message_sent",
      actorId: { not: null },
    },
    select: { actorId: true },
    distinct: ["actorId"],
  });

  const wanted = new Set<string>([
    candidate.createdById,
    ...candidate.applications.map((a) => a.ownerId),
    ...senders.map((s) => s.actorId as string),
  ]);

  const staff = await prisma.user.findMany({
    where: { organizationId, isActive: true, role: { in: ["OWNER", "HEAD", "RECRUITER", "ACCOUNT"] } },
    select: { id: true, role: true },
  });
  let userIds = staff.filter((u) => wanted.has(u.id)).map((u) => u.id);
  if (userIds.length === 0) {
    userIds = staff.filter((u) => u.role === "OWNER" || u.role === "HEAD").map((u) => u.id);
  }
  return { candidateId: candidate.id, fullName: candidate.fullName, userIds };
}
