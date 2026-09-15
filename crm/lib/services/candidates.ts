import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { plain } from "@/lib/db/serialize";
import { buildStorageKey, validateUpload } from "@/lib/storage";
import { getStorage } from "@/lib/storage/client";
import {
  normalizePhone,
  type CandidateProfileInput,
  type QuickCandidateInput,
} from "@/lib/validation/candidate";

/** Кандидат, уже участвующий в другой воронке. Нужен для предупреждения BR-7. */
export type DuplicateWarning = {
  candidateId: string;
  fullName: string;
  vacancyTitle: string;
  clientName: string;
  stageName: string;
};

/**
 * Поиск похожих кандидатов в базе организации (BR-7).
 *
 * Сравниваем по нормализованному телефону, почте и точному ФИО.
 * Смысл не в дедупликации базы, а в том, чтобы рекрутер не представил
 * одного человека двум клиентам одновременно, сам того не зная.
 */
export async function findSimilarCandidates(
  actor: Actor,
  params: { fullName?: string; phone?: string; email?: string },
): Promise<DuplicateWarning[]> {
  const phone = normalizePhone(params.phone);
  const email = params.email?.toLowerCase().trim();
  const fullName = params.fullName?.trim();

  const or: object[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (fullName) or.push({ fullName: { equals: fullName, mode: "insensitive" } });
  if (or.length === 0) return [];

  const candidates = await prisma.candidate.findMany({
    where: { organizationId: actor.organizationId, OR: or },
    select: {
      id: true,
      fullName: true,
      applications: {
        where: { outcome: "IN_PROGRESS" },
        select: {
          stage: { select: { name: true } },
          vacancy: {
            select: { title: true, client: { select: { name: true } } },
          },
        },
      },
    },
  });

  return candidates.flatMap((c) =>
    c.applications.map((a) => ({
      candidateId: c.id,
      fullName: c.fullName,
      vacancyTitle: a.vacancy.title,
      clientName: a.vacancy.client.name,
      stageName: a.stage.name,
    })),
  );
}

/** Быстрое добавление: имя, контакт, остальное дозаполняется потом. */
export async function quickCreateCandidate(
  actor: Actor,
  input: QuickCandidateInput,
) {
  return prisma.candidate.create({
    data: {
      organizationId: actor.organizationId,
      fullName: input.fullName,
      phone: normalizePhone(input.phone) ?? input.phone,
      email: input.email?.toLowerCase(),
      city: input.city,
      currentPosition: input.currentPosition,
      currentCompany: input.currentCompany,
      salaryExpectation: input.salaryExpectation,
      source: input.source,
      sourceDetails: input.sourceDetails,
      createdById: actor.id,
    },
    select: { id: true, fullName: true },
  });
}

export async function updateCandidateProfile(
  actor: Actor,
  candidateId: string,
  input: CandidateProfileInput,
) {
  const existing = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.candidate.update({
    where: { id: candidateId },
    data: {
      ...input,
      phone: normalizePhone(input.phone) ?? input.phone,
      email: input.email?.toLowerCase(),
    },
    select: { id: true },
  });
}

export type CandidateSearchParams = {
  query?: string;
  salaryFrom?: number;
  salaryTo?: number;
  /** Без него — без ограничения (нужно для типеахеда и служебных выборок). */
  take?: number;
};

/**
 * Общая база кандидатов агентства (ТЗ 7.3.4).
 * Клиенту недоступна: у него нет прав `application.viewInternal`.
 *
 * Пагинация тем же приёмом, что и у listApplications: берём на одну
 * запись больше запрошенного и по ней узнаём, есть ли ещё — раньше
 * список молча обрезался на 50 без всякого намёка, что кто-то остался
 * за кадром.
 */
export async function searchCandidates(
  actor: Actor,
  params: CandidateSearchParams = {},
) {
  const q = params.query?.trim();

  const where: Record<string, unknown> = {
    organizationId: actor.organizationId,
  };

  if (q) {
    const phone = normalizePhone(q);
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { currentPosition: { contains: q, mode: "insensitive" } },
      { currentCompany: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { skills: { hasSome: [q] } },
      ...(phone ? [{ phone }] : []),
      { email: { contains: q.toLowerCase() } },
    ];
  }

  if (params.salaryFrom || params.salaryTo) {
    where.salaryExpectation = {
      ...(params.salaryFrom && { gte: params.salaryFrom }),
      ...(params.salaryTo && { lte: params.salaryTo }),
    };
  }

  const candidates = await prisma.candidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(params.take && { take: params.take + 1 }),
    select: {
      id: true,
      fullName: true,
      currentPosition: true,
      currentCompany: true,
      city: true,
      phone: true,
      email: true,
      salaryExpectation: true,
      consentStatus: true,
      createdAt: true,
      _count: { select: { applications: true } },
    },
  });

  const hasMore = Boolean(params.take && candidates.length > params.take);
  const page = hasMore ? candidates.slice(0, params.take) : candidates;

  // Ожидание по зарплате — Decimal, а строка поиска живёт в клиентском
  // компоненте и получает список пропсом
  return { items: plain(page), hasMore };
}

/**
 * Карточка кандидата для агентства.
 *
 * Клиент сюда не ходит: он видит кандидата через Application,
 * где действует порог видимости (BR-3).
 */
export async function getCandidate(actor: Actor, candidateId: string) {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    include: {
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
      applications: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          outcome: true,
          presentedAt: true,
          stage: { select: { name: true } },
          vacancy: {
            select: {
              id: true,
              number: true,
              title: true,
              client: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!candidate) return null;

  // Просмотр карточки — это доступ к ПДн, его положено логировать (BR-36)
  await prisma.personalDataAccessLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      candidateId,
      action: "view",
    },
  });

  return plain(candidate);
}

/** Загрузка файла к кандидату — обычно резюме. */
export async function attachFile(
  actor: Actor,
  params: {
    candidateId?: string;
    applicationId?: string;
    file: File;
    kind: "RESUME" | "COVER_LETTER" | "TEST_TASK" | "PORTFOLIO" | "OTHER";
    visibility?: "INTERNAL" | "SHARED";
  },
) {
  const body = Buffer.from(await params.file.arrayBuffer());
  validateUpload({ size: params.file.size, type: params.file.type, body });

  const storageKey = buildStorageKey({
    organizationId: actor.organizationId,
    scope: params.candidateId ? "candidates" : "applications",
    scopeId: params.candidateId ?? params.applicationId ?? "misc",
    fileName: params.file.name,
  });
  await getStorage().put({
    key: storageKey,
    body,
    mimeType: params.file.type,
  });

  return prisma.attachment.create({
    data: {
      organizationId: actor.organizationId,
      kind: params.kind,
      fileName: params.file.name,
      fileSize: params.file.size,
      mimeType: params.file.type,
      storageKey,
      // Резюме по умолчанию внутреннее.
      //
      // Раньше было общим: считалось, что без резюме представление
      // клиенту не имеет смысла. Это неверно - клиент работает
      // с профилем из структурированных полей карточки, а исходный
      // файл содержит лишнее: домашний адрес, дату рождения,
      // семейное положение, фотографию (P0-5 юридического пакета).
      //
      // Пометка тут вторична: клиенту исходное резюме не отдаётся
      // в любом случае, это запрещено в слое доступа. Но правильное
      // значение по умолчанию бережёт от путаницы в интерфейсе.
      visibility: params.visibility ?? (params.kind === "RESUME" ? "INTERNAL" : "SHARED"),
      candidateId: params.candidateId,
      applicationId: params.applicationId,
      uploadedById: actor.id,
    },
    select: { id: true, fileName: true },
  });
}
