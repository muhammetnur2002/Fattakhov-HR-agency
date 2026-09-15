import type { Actor } from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { expiredConsentFilter } from "@/lib/services/consent";
import { getStorage } from "@/lib/storage/client";

export class RetentionError extends Error {}

/**
 * Сроки хранения и удаление персональных данных (BR-34, BR-35).
 *
 * Два разных механизма:
 *  — истечение согласия: наступает само по времени, данные попадают
 *    в список на удаление, но удаляет их человек;
 *  — запрос субъекта: человек попросил удалить — удаляем физически.
 *
 * Автоматически ничего не стирается. Кандидат, чьё согласие истекло
 * вчера, может завтра выйти на работу; молча удалить его историю —
 * потерять данные, за которые агентство отвечает перед клиентом.
 */

/** Помечает истёкшие согласия. Запускается фоновой задачей. */
export async function expireConsents(): Promise<number> {
  const result = await prisma.candidate.updateMany({
    // Что считать истёкшим — правило согласия, а не расписания задач:
    // держим его рядом с consentIsValid, которым проверяется
    // представление кандидата клиенту
    where: expiredConsentFilter(),
    data: { consentStatus: "EXPIRED" },
  });

  return result.count;
}

export type RetentionCandidate = {
  id: string;
  fullName: string;
  consentStatus: string;
  consentExpiresAt: Date | null;
  lastActivityAt: Date;
  activeApplications: number;
};

/**
 * Кандидаты, чьи данные подлежат удалению или обезличиванию.
 *
 * Кандидаты в активной работе исключены: их согласие надо продлить,
 * а не удалять данные посреди подбора.
 */
export async function listForRetention(
  actor: Actor,
): Promise<RetentionCandidate[]> {
  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId: actor.organizationId,
      consentStatus: { in: ["EXPIRED", "REVOKED"] },
    },
    select: {
      id: true,
      fullName: true,
      consentStatus: true,
      consentExpiresAt: true,
      updatedAt: true,
      applications: {
        select: { outcome: true },
      },
    },
  });

  return candidates
    .map((candidate) => ({
      id: candidate.id,
      fullName: candidate.fullName,
      consentStatus: candidate.consentStatus,
      consentExpiresAt: candidate.consentExpiresAt,
      lastActivityAt: candidate.updatedAt,
      activeApplications: candidate.applications.filter(
        (a) => a.outcome === "IN_PROGRESS",
      ).length,
    }))
    .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
}

/**
 * Физическое удаление персональных данных кандидата (BR-35).
 *
 * Именно физическое, а не мягкое: право на удаление означает, что
 * данных не остаётся, а не что они помечены флагом.
 *
 * При этом `Application` сохраняется обезличенным: воронка, конверсии
 * и статистика по вакансиям строятся на нём, и стирание записи
 * переписало бы историю работы агентства. Обезличенный кандидат —
 * это «Кандидат #1234» без единого контакта.
 */
export async function erasePersonalData(
  actor: Actor,
  candidateId: string,
): Promise<{ erasedFiles: number }> {
  const candidate = await prismaRaw.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: {
      id: true,
      attachments: { select: { id: true, storageKey: true } },
    },
  });
  if (!candidate) throw new RetentionError("Кандидат не найден");

  // Файлы удаляем из хранилища до записи в БД: иначе при сбое
  // останутся резюме, на которые уже нет ссылок
  let erasedFiles = 0;
  for (const attachment of candidate.attachments) {
    try {
      await getStorage().delete(attachment.storageKey);
      erasedFiles++;
    } catch (error) {
      console.error(`[ПДн] файл не удалён: ${attachment.storageKey}`, error);
    }
  }

  const anonymousName = `Кандидат #${candidateId.slice(-6)}`;

  await prismaRaw.$transaction([
    prismaRaw.attachment.deleteMany({ where: { candidateId } }),

    // Обезличивание вместо удаления: статистика остаётся,
    // персональных данных не остаётся
    prismaRaw.candidate.update({
      where: { id: candidateId },
      data: {
        fullName: anonymousName,
        phone: null,
        email: null,
        telegram: null,
        city: null,
        birthYear: null,
        currentPosition: null,
        currentCompany: null,
        education: null,
        summary: null,
        skills: [],
        sourceDetails: null,
        consentStatus: "REVOKED",
        consentToken: null,
        consentDocUrl: null,
        deletedAt: new Date(),
      },
    }),

    // Саммари представления содержит рассказ о человеке — тоже ПДн
    prismaRaw.application.updateMany({
      where: { candidateId },
      data: { presentationSummary: null },
    }),

    prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId,
        action: "erased",
      },
    }),
  ]);

  return { erasedFiles };
}

export type AccessLogEntry = {
  id: string;
  action: string;
  createdAt: Date;
  ip: string | null;
  actorName: string;
  candidateName: string;
};

/** Журнал доступа к персональным данным (BR-36). Только владельцу. */
export async function listAccessLog(
  actor: Actor,
  filters: { candidateId?: string; actorId?: string; limit?: number } = {},
): Promise<AccessLogEntry[]> {
  const entries = await prisma.personalDataAccessLog.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(filters.candidateId && { candidateId: filters.candidateId }),
      ...(filters.actorId && { actorId: filters.actorId }),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 200,
  });

  const actorIds = [...new Set(entries.map((e) => e.actorId))];
  const candidateIds = [...new Set(entries.map((e) => e.candidateId))];

  const [users, candidates] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true },
    }),
    // Удалённые тоже показываем: журнал должен пережить удаление
    prismaRaw.candidate.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, fullName: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u.fullName]));
  const candidateById = new Map(candidates.map((c) => [c.id, c.fullName]));

  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    createdAt: entry.createdAt,
    ip: entry.ip,
    // Если действие совершил сам кандидат (дал согласие), в actorId
    // лежит его id, а не сотрудника
    actorName:
      userById.get(entry.actorId) ??
      candidateById.get(entry.actorId) ??
      "—",
    candidateName: candidateById.get(entry.candidateId) ?? "удалён",
  }));
}

/** Человеку понятные названия действий в журнале. */
export const ACCESS_ACTION_LABELS: Record<string, string> = {
  view: "Просмотр карточки",
  download_file: "Скачивание файла",
  export: "Выгрузка отчёта",
  consent_given: "Согласие получено",
  consent_revoked: "Согласие отозвано",
  erased: "Данные удалены",
};
