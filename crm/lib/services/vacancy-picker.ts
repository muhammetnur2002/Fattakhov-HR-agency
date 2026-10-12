import { assertCanDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { ApplicationError } from "@/lib/services/applications";

/**
 * Подбор кандидатов из общей базы прямо внутри вакансии.
 *
 * Нынешнее добавление (`addToVacancy`) работает по одному и всегда кладёт
 * человека на первый этап. Рекрутёру, который подбирает десяток людей под
 * вакансию, нужно найти их по условиям, отметить нескольких и посадить
 * одним действием, сразу на нужный внутренний этап. Старый путь остаётся
 * как есть, здесь только новый.
 *
 * Сажать можно только на этапы, скрытые от клиента (по умолчанию «Лонг-лист»
 * и «Скрининг рекрутёра»). «Представлен клиенту» и дальше проходят через
 * представление (`presentToClient`), которое проверяет резюме и саммари:
 * посадить сразу на такой этап значило бы обойти эти проверки.
 */

/** Сколько кандидатов можно посадить за один раз. */
export const MAX_PICK = 50;

export type PickerParams = {
  query?: string;
  city?: string;
  salaryTo?: number;
  take?: number;
};

export type PickerCandidate = {
  id: string;
  fullName: string;
  currentPosition: string | null;
  city: string | null;
  salaryExpectation: number | null;
  /** Уже сидит в этой вакансии: выбрать нельзя. */
  inThisVacancy: boolean;
  /** Представлен клиенту по другой вакансии и ждёт его решения. */
  awaitingClient: boolean;
  /** В скольких других воронках сейчас в работе. */
  otherVacancies: number;
};

/**
 * Поиск по всей базе с отметками «уже здесь» и «ждёт клиента».
 *
 * Условия те же, что у общего поиска кандидатов (имя, должность, компания,
 * город, навык), плюс город и потолок зарплаты. Обезличенные и ждущие
 * удаления карточки не показываются: сажать их на вакансию нельзя.
 */
export async function searchForVacancy(
  actor: Actor,
  vacancyId: string,
  params: PickerParams = {},
): Promise<PickerCandidate[]> {
  assertCanDo(actor, "application.create");

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!vacancy) return [];

  const q = params.query?.trim();
  const city = params.city?.trim();
  const take = Math.min(Math.max(params.take ?? 20, 1), 50);

  const where: Record<string, unknown> = {
    organizationId: actor.organizationId,
    erasureState: "ACTIVE",
  };
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { currentPosition: { contains: q, mode: "insensitive" } },
      { currentCompany: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { skills: { hasSome: [q] } },
    ];
  }
  if (city) where.city = { contains: city, mode: "insensitive" };
  if (params.salaryTo && params.salaryTo > 0) {
    where.salaryExpectation = { lte: params.salaryTo };
  }

  const select = {
    id: true,
    fullName: true,
    currentPosition: true,
    city: true,
    salaryExpectation: true,
  } as const;

  // Сначала те, кого ещё можно посадить, и только потом уже сидящие в этой
  // вакансии: иначе в большой вакансии начало списка занято людьми, которых
  // выбрать нельзя
  const free = await prisma.candidate.findMany({
    where: { ...where, applications: { none: { vacancyId } } },
    orderBy: { createdAt: "desc" },
    take,
    select,
  });
  const already =
    free.length < take
      ? await prisma.candidate.findMany({
          where: { ...where, applications: { some: { vacancyId } } },
          orderBy: { createdAt: "desc" },
          take: take - free.length,
          select,
        })
      : [];
  const candidates = [...free, ...already];
  if (candidates.length === 0) return [];

  const applications = await prisma.application.findMany({
    where: {
      organizationId: actor.organizationId,
      candidateId: { in: candidates.map((c) => c.id) },
      OR: [{ vacancyId }, { outcome: "IN_PROGRESS" }],
    },
    select: {
      candidateId: true,
      vacancyId: true,
      outcome: true,
      presentedAt: true,
      clientDecision: true,
    },
  });

  return candidates.map((c) => {
    const mine = applications.filter((a) => a.candidateId === c.id);
    const elsewhere = mine.filter((a) => a.vacancyId !== vacancyId && a.outcome === "IN_PROGRESS");
    return {
      id: c.id,
      fullName: c.fullName,
      currentPosition: c.currentPosition,
      city: c.city,
      salaryExpectation: c.salaryExpectation == null ? null : Number(c.salaryExpectation),
      inThisVacancy: mine.some((a) => a.vacancyId === vacancyId),
      awaitingClient: elsewhere.some((a) => a.presentedAt !== null && a.clientDecision === null),
      otherVacancies: elsewhere.length,
    };
  });
}

export type PickResult = {
  added: number;
  skipped: { candidateId: string; reason: string }[];
};

/**
 * Посадить выбранных на внутренний этап вакансии.
 *
 * Каждая посадка — заявка плюс первая запись истории в одной транзакции,
 * как в `addToVacancy`. Тех, кто уже в вакансии или кого нет в базе
 * организации, пропускаем с причиной, а остальных сажаем: один лишний
 * человек в списке не должен срывать посадку остальных.
 */
export async function addManyToVacancy(
  actor: Actor,
  vacancyId: string,
  candidateIds: string[],
  stageId?: string,
): Promise<PickResult> {
  assertCanDo(actor, "application.create");

  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) throw new ApplicationError("Отметьте хотя бы одного кандидата");
  if (ids.length > MAX_PICK) {
    throw new ApplicationError(`За один раз можно посадить не больше ${MAX_PICK} кандидатов`);
  }

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: {
      id: true,
      stages: { orderBy: { order: "asc" }, select: { id: true, visibleToClient: true, isTerminal: true } },
    },
  });
  if (!vacancy) throw new ApplicationError("Вакансия не найдена");
  if (vacancy.stages.length === 0) {
    throw new ApplicationError("У вакансии нет воронки: она ещё не запущена в работу");
  }

  const pickable = vacancy.stages.filter((s) => !s.visibleToClient && !s.isTerminal);
  const stage = stageId ? pickable.find((s) => s.id === stageId) : pickable[0];
  if (!stage) {
    throw new ApplicationError(
      stageId
        ? "Посадить можно только на внутренний этап: «Представлен клиенту» и дальше идут через представление"
        : "У вакансии нет внутреннего этапа для посадки",
    );
  }

  const [found, existing] = await Promise.all([
    prisma.candidate.findMany({
      where: { id: { in: ids }, organizationId: actor.organizationId, erasureState: "ACTIVE" },
      select: { id: true },
    }),
    prisma.application.findMany({
      where: { vacancyId, candidateId: { in: ids } },
      select: { candidateId: true },
    }),
  ]);
  const foundSet = new Set(found.map((c) => c.id));
  const inVacancy = new Set(existing.map((a) => a.candidateId));

  const skipped: PickResult["skipped"] = [];
  const toAdd: string[] = [];
  for (const id of ids) {
    if (!foundSet.has(id)) skipped.push({ candidateId: id, reason: "Кандидат не найден" });
    else if (inVacancy.has(id)) skipped.push({ candidateId: id, reason: "Уже в воронке этой вакансии" });
    else toAdd.push(id);
  }

  let added = 0;
  for (const candidateId of toAdd) {
    try {
      await prisma.$transaction(async (tx) => {
        const application = await tx.application.create({
          data: {
            organizationId: actor.organizationId,
            vacancyId,
            candidateId,
            stageId: stage.id,
            ownerId: actor.id,
          },
          select: { id: true },
        });
        await tx.stageTransition.create({
          data: {
            applicationId: application.id,
            toStageId: stage.id,
            toOutcome: "IN_PROGRESS",
            actorId: actor.id,
            comment: "Добавлен в воронку (подбор из базы)",
          },
        });
      });
      added += 1;
    } catch (error) {
      // Второй такой же вызов успел раньше: уникальный индекс (BR-6) отказывает
      if ((error as { code?: string }).code === "P2002") {
        skipped.push({ candidateId, reason: "Уже в воронке этой вакансии" });
      } else {
        throw error;
      }
    }
  }

  return { added, skipped };
}
