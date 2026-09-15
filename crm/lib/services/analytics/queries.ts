import {
  visibleApplicationsFilter,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type { RejectionReason, RejectionSide } from "@/lib/generated/prisma/enums";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/services/pipeline-stages";
import { businessHoursBetween } from "@/lib/services/sla";
import {
  average,
  buildFunnel,
  conversion,
  daysBetween,
  median,
  presentationQuality,
  type FunnelStep,
} from "./metrics";

export type Period = { from: Date; to: Date };

/** Период по умолчанию — квартал: на меньшем окне статистика шумит. */
export function defaultPeriod(days = 90): Period {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from, to };
}

export type ClientAnalytics = {
  inProgress: number;
  presentedInPeriod: number;
  hiredInPeriod: number;
  funnel: FunnelStep[];
  /** Дни от запуска вакансии до первого представленного кандидата. */
  daysToFirstCandidate: number | null;
  /** Дни от запуска до выхода, медианой. */
  timeToHire: number | null;
  /** Рабочие часы от представления до решения клиента. */
  avgDecisionHours: number | null;
  rejections: { reason: RejectionReason; count: number }[];
  /** Объём работы агентства — то, чего клиент обычно не видит. */
  agencyWork: { screened: number; presented: number; interviewed: number };
};

/**
 * Аналитика для кабинета клиента (ТЗ 11.1).
 *
 * Все выборки идут через фильтры видимости: клиент видит статистику
 * только по своим вакансиям. Порог видимости (BR-3) здесь тоже
 * действует — кандидаты с лонг-листа в его цифры не попадают, кроме
 * блока «работа агентства», где показан именно объём невидимой работы.
 */
export async function clientAnalytics(
  actor: Actor,
  period: Period,
): Promise<ClientAnalytics> {
  const visibleApplications = visibleApplicationsFilter(actor);
  const visibleVacancies = visibleVacanciesFilter(actor);

  const [inProgress, presentedInPeriod, hiredInPeriod] = await Promise.all([
    prisma.application.count({
      where: { ...visibleApplications, outcome: "IN_PROGRESS" },
    }),
    prisma.application.count({
      where: {
        ...visibleApplications,
        presentedAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.application.count({
      where: {
        ...visibleApplications,
        outcome: "HIRED",
        hiredAt: { gte: period.from, lte: period.to },
      },
    }),
  ]);

  const funnel = await buildFunnelFor(actor, {
    ...visibleApplications,
  });

  // Сроки считаем по вакансиям, которые реально запускались
  const vacancies = await prisma.vacancy.findMany({
    where: { ...visibleVacancies, activatedAt: { not: null } },
    select: {
      id: true,
      activatedAt: true,
      closedAt: true,
      status: true,
      applications: {
        select: { presentedAt: true, hiredAt: true },
      },
    },
  });

  const firstCandidateDays: number[] = [];
  const hireDays: number[] = [];

  for (const vacancy of vacancies) {
    if (!vacancy.activatedAt) continue;

    const presentedDates = vacancy.applications
      .map((a) => a.presentedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (presentedDates[0]) {
      firstCandidateDays.push(daysBetween(vacancy.activatedAt, presentedDates[0]));
    }

    const hired = vacancy.applications
      .map((a) => a.hiredAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (hired[0]) {
      hireDays.push(daysBetween(vacancy.activatedAt, hired[0]));
    }
  }

  // Скорость реакции клиента — в рабочих часах (BR-9)
  const decided = await prisma.application.findMany({
    where: {
      ...visibleApplications,
      presentedAt: { not: null },
      clientDecisionAt: { not: null },
    },
    select: { presentedAt: true, clientDecisionAt: true },
  });

  const decisionHours = decided
    .filter((a) => a.presentedAt && a.clientDecisionAt)
    .map((a) => businessHoursBetween(a.presentedAt!, a.clientDecisionAt!));

  const rejections = await rejectionBreakdown(actor, "CLIENT");

  const agencyWork = await agencyWorkVolume(actor, period);

  return {
    inProgress,
    presentedInPeriod,
    hiredInPeriod,
    funnel,
    daysToFirstCandidate: median(firstCandidateDays),
    timeToHire: median(hireDays),
    avgDecisionHours: average(decisionHours),
    rejections,
    agencyWork,
  };
}

/**
 * Сколько кандидатов прошло через каждый этап.
 *
 * Считаем объединением двух источников:
 *  1. текущий этап — если кандидат сейчас на оффере, значит через
 *     представление он проходил, даже если истории нет;
 *  2. история переходов — ловит тех, кого вернули назад: сейчас он
 *     на скрининге, но до представления доходил.
 *
 * Только по истории считать нельзя: она может быть неполной у данных,
 * заведённых до появления журнала или перенесённых извне. Только по
 * текущему этапу — тоже: возвраты потеряются.
 */
async function buildFunnelFor(
  actor: Actor,
  applicationWhere: object,
): Promise<FunnelStep[]> {
  const applications = await prisma.application.findMany({
    where: applicationWhere,
    select: {
      id: true,
      stage: { select: { code: true, order: true } },
      transitions: { select: { toStageId: true } },
    },
  });

  const visible = stagesVisibleTo(actor);
  const steps = DEFAULT_PIPELINE_STAGES.filter((s) => visible.includes(s.code));

  if (applications.length === 0) return buildFunnel(steps, new Map());

  // Этапы принадлежат вакансиям, поэтому один код существует
  // во множестве экземпляров — нужна карта id → код
  const stages = await prisma.pipelineStage.findMany({
    where: {
      vacancy: {
        applications: { some: { id: { in: applications.map((a) => a.id) } } },
      },
    },
    select: { id: true, code: true },
  });
  const codeById = new Map(stages.map((s) => [s.id, s.code]));

  const orderByCode = new Map(
    DEFAULT_PIPELINE_STAGES.map((s) => [s.code as string, s.order]),
  );

  const reached = new Map<string, number>();

  for (const application of applications) {
    const codes = new Set<string>();

    // Всё, что по порядку не позже текущего этапа
    const currentOrder = application.stage.order;
    for (const stage of DEFAULT_PIPELINE_STAGES) {
      if (stage.order <= currentOrder) codes.add(stage.code);
    }

    // Плюс всё, где кандидат был по истории
    for (const transition of application.transitions) {
      const code = codeById.get(transition.toStageId);
      if (code && orderByCode.has(code)) codes.add(code);
    }

    for (const code of codes) {
      reached.set(code, (reached.get(code) ?? 0) + 1);
    }
  }

  return buildFunnel(steps, reached);
}

/** Клиенту не показываем внутренние этапы даже в аналитике (BR-3). */
function stagesVisibleTo(actor: Actor): string[] {
  const all = DEFAULT_PIPELINE_STAGES.map((s) => s.code);
  if (actor.clientId === null) return all;
  return DEFAULT_PIPELINE_STAGES.filter((s) => s.visibleToClient).map(
    (s) => s.code,
  );
}

/**
 * Распределение причин отказа.
 *
 * Это рабочий инструмент, а не отчётность: по нему рекрутер понимает,
 * кого искать дальше. Поэтому разделено по стороне — «мы не подошли»
 * и «нам не подошли» это разные проблемы.
 */
export async function rejectionBreakdown(
  actor: Actor,
  side?: RejectionSide,
): Promise<{ reason: RejectionReason; count: number }[]> {
  const grouped = await prisma.application.groupBy({
    by: ["rejectionReason"],
    where: {
      ...visibleApplicationsFilter(actor),
      rejectionReason: { not: null },
      ...(side && { rejectedBy: side }),
    },
    _count: true,
  });

  return grouped
    .filter((g) => g.rejectionReason !== null)
    .map((g) => ({ reason: g.rejectionReason!, count: g._count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Объём работы агентства за период.
 *
 * Тот самый блок, который продаёт продление контракта: клиент видит
 * только представленных, а до них были лонг-лист и скрининг.
 */
async function agencyWorkVolume(
  actor: Actor,
  period: Period,
): Promise<{ screened: number; presented: number; interviewed: number }> {
  // Здесь намеренно НЕ фильтр видимости кандидатов: показываем объём
  // работы, а не самих людей. Ограничение — только по вакансиям клиента
  const vacancyFilter = visibleVacanciesFilter(actor);

  const [screened, presented, interviewed] = await Promise.all([
    prisma.application.count({
      where: {
        vacancy: vacancyFilter,
        createdAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.application.count({
      where: {
        vacancy: vacancyFilter,
        presentedAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.interview.count({
      where: {
        vacancy: vacancyFilter,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        scheduledAt: { gte: period.from, lte: period.to },
      },
    }),
  ]);

  return { screened, presented, interviewed };
}

export type RecruiterLoad = {
  recruiterId: string;
  fullName: string;
  activeVacancies: number;
  activeCandidates: number;
  presented: number;
  /** Доля представленных, дошедших до интервью. */
  quality: number | null;
};

export type AgencyAnalytics = {
  funnel: FunnelStep[];
  load: RecruiterLoad[];
  medianDaysToFirstPresentation: number | null;
  vacanciesAtRisk: {
    id: string;
    number: number;
    title: string;
    clientName: string;
    /** Кто ведёт — иначе «вакансия стоит» не превращается в разговор. */
    leadRecruiterName: string | null;
    daysActive: number;
    reason: string;
  }[];
  overdueDecisions: number;
  rejectionsByClient: { reason: RejectionReason; count: number }[];
};

/** Внутренняя аналитика агентства (ТЗ 11.2). */
export async function agencyAnalytics(
  actor: Actor,
  period: Period,
): Promise<AgencyAnalytics> {
  const funnel = await buildFunnelFor(actor, {
    organizationId: actor.organizationId,
  });

  const recruiters = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      role: { in: ["RECRUITER", "HEAD"] },
      isActive: true,
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  const load: RecruiterLoad[] = [];

  for (const recruiter of recruiters) {
    const [activeVacancies, activeCandidates, presented, interviewed] =
      await Promise.all([
        prisma.vacancy.count({
          where: {
            organizationId: actor.organizationId,
            status: "ACTIVE",
            recruiterIds: { has: recruiter.id },
          },
        }),
        prisma.application.count({
          where: {
            organizationId: actor.organizationId,
            ownerId: recruiter.id,
            outcome: "IN_PROGRESS",
          },
        }),
        prisma.application.count({
          where: {
            organizationId: actor.organizationId,
            presentedById: recruiter.id,
            presentedAt: { gte: period.from, lte: period.to },
          },
        }),
        prisma.application.count({
          where: {
            organizationId: actor.organizationId,
            presentedById: recruiter.id,
            presentedAt: { gte: period.from, lte: period.to },
            interviews: { some: {} },
          },
        }),
      ]);

    load.push({
      recruiterId: recruiter.id,
      fullName: recruiter.fullName,
      activeVacancies,
      activeCandidates,
      presented,
      quality: presentationQuality(presented, interviewed),
    });
  }

  // Скорость: сколько дней от запуска до первого представленного
  const activated = await prisma.vacancy.findMany({
    where: {
      organizationId: actor.organizationId,
      activatedAt: { not: null, gte: period.from },
    },
    select: {
      activatedAt: true,
      applications: { select: { presentedAt: true } },
    },
  });

  const firstPresentationDays = activated
    .map((v) => {
      const first = v.applications
        .map((a) => a.presentedAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return first && v.activatedAt ? daysBetween(v.activatedAt, first) : null;
    })
    .filter((d): d is number => d !== null);

  const atRisk = await findVacanciesAtRisk(actor);
  const overdueDecisions = await countOverdueDecisions(actor);
  const rejectionsByClient = await rejectionBreakdown(actor, "CLIENT");

  return {
    funnel,
    load,
    medianDaysToFirstPresentation: median(firstPresentationDays),
    vacanciesAtRisk: atRisk,
    overdueDecisions,
    rejectionsByClient,
  };
}

/**
 * Вакансии в риске.
 *
 * Два признака: долго в работе без найма и давно нет представлений.
 * Второй важнее — он ловит проблему до того, как клиент её заметит.
 */
/** «42 дня», а не «42 дней»: цифра рядом с неверной формой читается как небрежность. */
function pluralDays(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  if (!teen && last === 1) return "день";
  if (!teen && last >= 2 && last <= 4) return "дня";
  return "дней";
}

async function findVacanciesAtRisk(actor: Actor) {
  const vacancies = await prisma.vacancy.findMany({
    where: { organizationId: actor.organizationId, status: "ACTIVE" },
    select: {
      id: true,
      number: true,
      title: true,
      activatedAt: true,
      leadRecruiterId: true,
      client: { select: { name: true } },
      applications: { select: { presentedAt: true } },
    },
  });

  // Имена ведущих — одним запросом, а не по вакансии
  const leadIds = [...new Set(vacancies.map((v) => v.leadRecruiterId).filter(Boolean))];
  const leads = await prisma.user.findMany({
    where: { id: { in: leadIds as string[] } },
    select: { id: true, fullName: true },
  });
  const leadName = new Map(leads.map((u) => [u.id, u.fullName]));

  const now = new Date();
  const risky: AgencyAnalytics["vacanciesAtRisk"] = [];

  for (const vacancy of vacancies) {
    if (!vacancy.activatedAt) continue;

    const daysActive = daysBetween(vacancy.activatedAt, now);
    const presentations = vacancy.applications
      .map((a) => a.presentedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());

    const lastPresentation = presentations[0];
    const daysSincePresentation = lastPresentation
      ? daysBetween(lastPresentation, now)
      : daysActive;

    if (daysSincePresentation > 7) {
      risky.push({
        id: vacancy.id,
        number: vacancy.number,
        title: vacancy.title,
        clientName: vacancy.client.name,
        leadRecruiterName: vacancy.leadRecruiterId
          ? (leadName.get(vacancy.leadRecruiterId) ?? null)
          : null,
        daysActive,
        reason: lastPresentation
          ? `Нет представлений ${daysSincePresentation} ${pluralDays(daysSincePresentation)}`
          : `Ни одного кандидата за ${daysActive} ${pluralDays(daysActive)}`,
      });
      continue;
    }

    if (daysActive > 30) {
      risky.push({
        id: vacancy.id,
        number: vacancy.number,
        title: vacancy.title,
        clientName: vacancy.client.name,
        leadRecruiterName: vacancy.leadRecruiterId
          ? (leadName.get(vacancy.leadRecruiterId) ?? null)
          : null,
        daysActive,
        reason: `В работе ${daysActive} ${pluralDays(daysActive)} без найма`,
      });
    }
  }

  return risky.sort((a, b) => b.daysActive - a.daysActive);
}

/** Сколько кандидатов ждут решения клиента дольше норматива (BR-9). */
async function countOverdueDecisions(actor: Actor): Promise<number> {
  const waiting = await prisma.application.findMany({
    where: {
      organizationId: actor.organizationId,
      presentedAt: { not: null },
      clientDecision: null,
      outcome: "IN_PROGRESS",
    },
    select: { presentedAt: true, stage: { select: { slaHours: true } } },
  });

  const now = new Date();
  return waiting.filter((a) => {
    if (!a.presentedAt || !a.stage.slaHours) return false;
    return businessHoursBetween(a.presentedAt, now) >= a.stage.slaHours;
  }).length;
}

export { conversion };
