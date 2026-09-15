import {
  canDo,
  stripInternal,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { plain } from "@/lib/db/serialize";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { UNASSIGNED_RECRUITER } from "@/lib/labels";
import { link } from "@/lib/notifications/links";
import { notify } from "@/lib/notifications/notify";
import {
  agencySideRecipients,
  clientSideRecipients,
  intakeRecipients,
} from "@/lib/notifications/recipients";
import { getActiveAgreement } from "@/lib/services/agreements";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/services/pipeline-stages";
import {
  canTransition,
  isReactivation,
  requiresCloseReason,
  VacancyTransitionError,
} from "@/lib/services/vacancy-status";
import type { VacancyBriefInput } from "@/lib/validation/vacancy";

/**
 * Следующий номер вакансии в организации (BR-25).
 *
 * Считается в транзакции с блокировкой строки организации: без неё две
 * одновременные заявки получат один номер и вторая упадёт на уникальном
 * индексе. `SELECT ... FOR UPDATE` сериализует их.
 */
async function nextVacancyNumber(
  tx: Parameters<Parameters<typeof prismaRaw.$transaction>[0]>[0],
  organizationId: string,
): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;

  const last = await tx.vacancy.findFirst({
    where: { organizationId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return (last?.number ?? 0) + 1;
}

/**
 * Создание черновика заявки. Номер выдаётся сразу — на него ссылаются в переписке.
 *
 * Нанимающий менеджер видит только вакансии, где он указан заказчиком —
 * `visibleVacanciesFilter` фильтрует по `hiringManagerId: actor.id`
 * прямо в запросе к базе (сноска ² к матрице прав). Поле в мастере
 * необязательное и по умолчанию пустое, и если такой менеджер заводит
 * вакансию сам, ничего не выбирая (обычный путь — зачем выбирать себя
 * из списка, когда это и так он), заявка после сохранения молча
 * пропадает из его собственного списка: `null` не совпадает
 * с `actor.id`, и созданное им же становится невидимым для него же.
 *
 * Явный выбор в форме не трогаем — если нанимающий менеджер заводит
 * заявку за коллегу и указывает его в списке, это его решение.
 * Достраиваем только пустое поле, и только этой роли: у CLIENT_ADMIN
 * пустое поле — валидное состояние «пока без ответственного».
 */
export async function createVacancyDraft(
  actor: Actor,
  clientId: string,
  input: Partial<VacancyBriefInput> & { title: string },
) {
  const data = toVacancyData(input);
  if (actor.role === "CLIENT_HIRING" && !data.hiringManagerId) {
    data.hiringManagerId = actor.id;
  }

  return prismaRaw.$transaction(async (tx) => {
    const number = await nextVacancyNumber(tx, actor.organizationId);

    return tx.vacancy.create({
      data: {
        ...data,
        title: input.title,
        number,
        organizationId: actor.organizationId,
        clientId,
        status: "DRAFT",
        createdById: actor.id,
      },
      select: { id: true, number: true },
    });
  });
}

/** Сохранение черновика — используется автосохранением мастера (BR-20). */
export async function updateVacancyBrief(
  actor: Actor,
  vacancyId: string,
  input: Partial<VacancyBriefInput>,
) {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!vacancy) return null;

  return prisma.vacancy.update({
    where: { id: vacancyId },
    data: toVacancyData(input),
    select: { id: true, updatedAt: true },
  });
}

/**
 * Перевод вакансии в другой статус.
 *
 * Единственная точка, где меняется `Vacancy.status`. Все проверки —
 * здесь, чтобы нельзя было обойти их, вызвав update напрямую из экрана.
 */
export async function transitionVacancy(
  actor: Actor,
  vacancyId: string,
  to: VacancyStatus,
  options: {
    closeReason?: string;
    estimatedFirstCandidatesAt?: Date | null;
    estimatedCloseAt?: Date | null;
  } = {},
) {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: {
      id: true,
      status: true,
      clientId: true,
      estimatedFirstCandidatesAt: true,
      _count: { select: { stages: true } },
    },
  });

  if (!vacancy) throw new VacancyTransitionError("Вакансия не найдена");

  const from = vacancy.status;

  if (from === to) throw new VacancyTransitionError("Статус уже установлен");

  if (!canTransition(from, to)) {
    throw new VacancyTransitionError(
      `Переход из «${from}» в «${to}» не предусмотрен`,
    );
  }

  if (isReactivation(from, to) && !canDo(actor, "vacancy.reactivate")) {
    throw new VacancyTransitionError(
      "Вернуть закрытую вакансию в работу может только руководство",
    );
  }

  // BR-2: обещать сроки, не назвав дату, нельзя
  const estimatedAt =
    options.estimatedFirstCandidatesAt ?? vacancy.estimatedFirstCandidatesAt;
  if (to === "ESTIMATED" && !estimatedAt) {
    throw new VacancyTransitionError(
      "Укажите дату, к которой будут первые кандидаты",
    );
  }

  // BR-1: без действующего договора вакансию в работу не запускаем
  if (to === "ACTIVE") {
    const agreement = await getActiveAgreement(vacancy.clientId);
    if (!agreement) {
      throw new VacancyTransitionError(
        "У клиента нет действующего договора — оформите условия сотрудничества",
      );
    }
  }

  if (requiresCloseReason(to) && !options.closeReason?.trim()) {
    throw new VacancyTransitionError("Укажите причину закрытия");
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (to === "SUBMITTED" && from === "DRAFT") data.submittedAt = now;
  if (to === "ACTIVE") {
    data.activatedAt = now;
    data.closedAt = null;
    data.closeReason = null;
    // Договор фиксируется на момент запуска: если условия потом сменятся,
    // считать вознаграждение надо по тем, при которых работа начиналась
    const agreement = await getActiveAgreement(vacancy.clientId);
    if (agreement) data.agreementId = agreement.id;
  }
  if (requiresCloseReason(to) || to === "CLOSED_SUCCESS") {
    data.closedAt = now;
    if (options.closeReason) data.closeReason = options.closeReason.trim();
  }
  if (options.estimatedFirstCandidatesAt !== undefined) {
    data.estimatedFirstCandidatesAt = options.estimatedFirstCandidatesAt;
  }
  if (options.estimatedCloseAt !== undefined) {
    data.estimatedCloseAt = options.estimatedCloseAt;
  }

  await prisma.vacancy.update({ where: { id: vacancyId }, data });

  // Этапы воронки создаются один раз, при первом запуске в работу.
  // При реактивации не пересоздаём — иначе потеряется история кандидатов.
  if (to === "ACTIVE" && vacancy._count.stages === 0) {
    await createPipelineStages(vacancyId);
  }

  await notifyAboutTransition(actor, vacancyId, to);

  return { from, to };
}

/**
 * Уведомления о смене статуса вакансии.
 *
 * Каждая сторона узнаёт о том, что зависит от неё: агентство — о новой
 * заявке, клиент — о сроках и запуске в работу.
 */
async function notifyAboutTransition(
  actor: Actor,
  vacancyId: string,
  to: VacancyStatus,
): Promise<void> {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId },
    select: {
      number: true,
      title: true,
      estimatedFirstCandidatesAt: true,
      leadRecruiterId: true,
      client: { select: { name: true } },
    },
  });
  if (!vacancy) return;

  const label = `№${vacancy.number} ${vacancy.title}`;

  if (to === "SUBMITTED") {
    await notify({
      organizationId: actor.organizationId,
      userIds: await intakeRecipients(actor.organizationId, actor.id),
      event: "VACANCY_SUBMITTED",
      title: `Новая заявка: ${label}`,
      body: `Клиент ${vacancy.client.name} ждёт ответа.`,
      linkUrl: link.vacancy(vacancyId),
    });
    return;
  }

  if (to === "ESTIMATED") {
    await notify({
      organizationId: actor.organizationId,
      userIds: await clientSideRecipients(vacancyId, actor.id),
      event: "VACANCY_ESTIMATED",
      title: `Мы оценили сроки: ${label}`,
      body: vacancy.estimatedFirstCandidatesAt
        ? `Первые кандидаты к ${formatDate(vacancy.estimatedFirstCandidatesAt)}.`
        : undefined,
      linkUrl: link.vacancy(vacancyId),
    });
    return;
  }

  if (to === "ACTIVE") {
    const recruiter = vacancy.leadRecruiterId
      ? await prisma.user.findFirst({
          where: { id: vacancy.leadRecruiterId },
          select: { fullName: true },
        })
      : null;

    await notify({
      organizationId: actor.organizationId,
      userIds: await clientSideRecipients(vacancyId, actor.id),
      event: "VACANCY_ACTIVATED",
      title: `Взяли в работу: ${label}`,
      body: recruiter ? `Рекрутер — ${recruiter.fullName}.` : undefined,
      linkUrl: link.vacancy(vacancyId),
    });
    return;
  }

  if (to.startsWith("CLOSED_")) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [
        ...(await clientSideRecipients(vacancyId, actor.id)),
        ...(await agencySideRecipients(vacancyId, actor.id)),
      ],
      event: "VACANCY_CLOSED",
      title: `Вакансия закрыта: ${label}`,
      linkUrl: link.vacancy(vacancyId),
    });
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
  }).format(date);
}

/** Этапы воронки из шаблона организации (ТЗ 5.3). */
export async function createPipelineStages(vacancyId: string) {
  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s) => ({
      vacancyId,
      code: s.code,
      name: s.name,
      order: s.order,
      visibleToClient: s.visibleToClient,
      isTerminal: s.isTerminal,
      slaHours: s.slaHours,
    })),
  });
}

export type RecruiterWithLoad = {
  id: string;
  fullName: string;
  /** Активные вакансии, где человек в команде. */
  vacancies: number;
  /** Кандидаты в работе по этим вакансиям. */
  candidates: number;
};

/**
 * Рекрутёры вместе с текущей нагрузкой — для формы назначения.
 *
 * Назначать вслепую нельзя: список из одних имён заставляет держать
 * загрузку команды в голове или открывать аналитику в соседней вкладке.
 * Цифры считаются одним проходом по активным вакансиям, а не запросом
 * на человека.
 */
export async function listRecruitersWithLoad(
  actor: Actor,
): Promise<RecruiterWithLoad[]> {
  const [people, vacancies] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        role: { in: ["RECRUITER", "HEAD", "OWNER"] },
        isActive: true,
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.vacancy.findMany({
      where: { organizationId: actor.organizationId, status: "ACTIVE" },
      select: {
        recruiterIds: true,
        _count: { select: { applications: { where: { outcome: "IN_PROGRESS" } } } },
      },
    }),
  ]);

  const load = new Map<string, { vacancies: number; candidates: number }>();
  for (const vacancy of vacancies) {
    for (const id of vacancy.recruiterIds) {
      const current = load.get(id) ?? { vacancies: 0, candidates: 0 };
      current.vacancies += 1;
      current.candidates += vacancy._count.applications;
      load.set(id, current);
    }
  }

  return people.map((person) => ({
    ...person,
    vacancies: load.get(person.id)?.vacancies ?? 0,
    candidates: load.get(person.id)?.candidates ?? 0,
  }));
}

/**
 * Назначение рекрутеров. Ведущий автоматически входит в команду.
 *
 * О назначении обязательно узнаёт тот, кого назначили. Раньше это была
 * молчаливая запись в базу: человеку доставалась вакансия, а сообщения
 * об этом не было ни в одном канале — он замечал её сам, если заходил
 * в список и всматривался. Уведомление уходит только новым в команде:
 * повторное сохранение карточки не должно рассылать то же самое ещё раз.
 */
export async function assignRecruiters(
  actor: Actor,
  vacancyId: string,
  leadRecruiterId: string | null,
  recruiterIds: string[],
) {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: {
      id: true,
      number: true,
      title: true,
      leadRecruiterId: true,
      recruiterIds: true,
      client: { select: { name: true } },
    },
  });
  if (!vacancy) return null;

  const team = new Set(recruiterIds);
  if (leadRecruiterId) team.add(leadRecruiterId);

  const updated = await prisma.vacancy.update({
    where: { id: vacancyId },
    data: { leadRecruiterId, recruiterIds: [...team] },
    select: { id: true },
  });

  const wasOnTeam = new Set(vacancy.recruiterIds);
  const newLead =
    leadRecruiterId !== null &&
    leadRecruiterId !== vacancy.leadRecruiterId &&
    leadRecruiterId !== actor.id
      ? leadRecruiterId
      : null;

  // Тот, кто назначает, себе не пишет
  const addedToTeam = [...team].filter(
    (id) => id !== actor.id && id !== newLead && !wasOnTeam.has(id),
  );

  const title = `Вакансия №${vacancy.number} ${vacancy.title}`;
  const common = {
    organizationId: actor.organizationId,
    event: "RECRUITER_ASSIGNED" as const,
    title,
    linkUrl: link.vacancy(vacancy.id),
    groupKey: vacancy.id,
  };

  // Ведущий и остальная команда получают разный текст: «ведёшь» и
  // «участвуешь» — разные обязательства
  if (newLead) {
    await notify({
      ...common,
      userIds: [newLead],
      body: `${vacancy.client.name} — вы ведущий по этой вакансии`,
    });
  }

  if (addedToTeam.length > 0) {
    await notify({
      ...common,
      userIds: addedToTeam,
      body: `${vacancy.client.name} — вы в команде по этой вакансии`,
    });
  }

  return updated;
}

export type VacancyListFilters = {
  status?: VacancyStatus;
  clientId?: string;
  recruiterId?: string;
  /** Поиск по названию, подразделению или городу — фильтрация на сервере (BR-22). */
  query?: string;
  /** Не заданы — отдаём всё (агентскому списку пагинация пока не нужна). */
  take?: number;
  skip?: number;
};

export async function listVacancies(
  actor: Actor,
  filters: VacancyListFilters = {},
) {
  const where: Record<string, unknown> = { ...visibleVacanciesFilter(actor) };

  if (filters.status) where.status = filters.status;
  if (filters.clientId) where.clientId = filters.clientId;
  // «none» — не рекрутёр, а его отсутствие: вакансия в работе, а вести
  // её некому. С дашборда руководителя ведёт ссылка именно сюда
  if (filters.recruiterId === UNASSIGNED_RECRUITER) {
    where.leadRecruiterId = null;
  } else if (filters.recruiterId) {
    where.recruiterIds = { has: filters.recruiterId };
  }
  if (filters.query) {
    /*
      Поиск кладётся в AND, а не рядом с фильтром видимости.

      У фильтра видимости бывает свой OR: нанимающий менеджер видит
      вакансии, где заказчик он, плюс ничьи. Два ключа `OR` в одном
      объекте — это не «и то, и другое», а тихая перезапись одного
      другим, и побеждал поиск. Нанимающий менеджер, набрав в строке
      поиска любую букву, получал вакансии соседа по компании: без
      поиска они не показывались, с поиском появлялись.

      Так же — через AND — устроен поиск в listApplications.
    */
    where.AND = [
      {
        OR: [
          { title: { contains: filters.query, mode: "insensitive" } },
          { department: { contains: filters.query, mode: "insensitive" } },
          { city: { contains: filters.query, mode: "insensitive" } },
        ],
      },
    ];
  }

  const vacancies = await prisma.vacancy.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    // На одну запись больше запрошенного — по ней узнаём, что дальше
    // есть ещё, без отдельного count-запроса (BR-22)
    ...(filters.take && { take: filters.take + 1 }),
    ...(filters.skip && { skip: filters.skip }),
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      department: true,
      city: true,
      headcount: true,
      urgency: true,
      salaryFrom: true,
      salaryTo: true,
      createdAt: true,
      submittedAt: true,
      estimatedFirstCandidatesAt: true,
      leadRecruiterId: true,
      client: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });

  const hasMore = Boolean(filters.take && vacancies.length > filters.take);
  const page = hasMore ? vacancies.slice(0, filters.take) : vacancies;

  // Вилка — Decimal, а список рисуется в том числе клиентскими компонентами
  return { items: plain(page), hasMore };
}

/** Карточка вакансии. null → вызывающий обязан отдать 404 (BR-28). */
export async function getVacancy(actor: Actor, vacancyId: string) {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, ...visibleVacanciesFilter(actor) },
    include: {
      client: { select: { id: true, name: true } },
      stages: { orderBy: { order: "asc" } },
      _count: { select: { applications: true } },
    },
  });

  if (!vacancy) return null;

  // Внутренние заметки не должны доехать до браузера клиента даже
  // неотрисованными: данные страницы уходят целиком
  return stripInternal(actor, plain(vacancy), ["agencyNotes"]);
}

/** Приводит вход формы к полям модели, отбрасывая пустые строки. */
function toVacancyData(input: Partial<VacancyBriefInput>) {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.department !== undefined && { department: input.department }),
    ...(input.hiringManagerId !== undefined && {
      hiringManagerId: input.hiringManagerId || null,
    }),
    ...(input.headcount !== undefined && { headcount: input.headcount }),
    ...(input.reasonForHire !== undefined && {
      reasonForHire: input.reasonForHire,
    }),
    ...(input.responsibilities !== undefined && {
      responsibilities: input.responsibilities,
    }),
    ...(input.requirements !== undefined && { requirements: input.requirements }),
    ...(input.niceToHave !== undefined && { niceToHave: input.niceToHave }),
    ...(input.conditions !== undefined && { conditions: input.conditions }),
    ...(input.salaryFrom !== undefined && { salaryFrom: input.salaryFrom }),
    ...(input.salaryTo !== undefined && { salaryTo: input.salaryTo }),
    ...(input.salaryGross !== undefined && { salaryGross: input.salaryGross }),
    ...(input.bonusScheme !== undefined && { bonusScheme: input.bonusScheme }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.workFormat !== undefined && { workFormat: input.workFormat }),
    ...(input.employmentType !== undefined && {
      employmentType: input.employmentType,
    }),
    ...(input.workSchedule !== undefined && { workSchedule: input.workSchedule }),
    ...(input.stopFactors !== undefined && { stopFactors: input.stopFactors }),
    ...(input.targetCompanies !== undefined && {
      targetCompanies: input.targetCompanies,
    }),
    ...(input.interviewStages !== undefined && {
      interviewStages: input.interviewStages,
    }),
    ...(input.urgency !== undefined && { urgency: input.urgency }),
    ...(input.desiredStartDate !== undefined && {
      desiredStartDate: input.desiredStartDate,
    }),
  };
}
