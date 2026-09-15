import {
  canDo,
  visibleApplicationsFilter,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { isOverdueBySla } from "@/lib/services/sla";

/** Полночь через N дней от текущего момента. */
function inDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export type ClientDashboardStats = {
  activeVacancies: number;
  awaitingDecision: number;
  interviewsThisWeek: number;
  closedLast90Days: number;
};

/**
 * Плитки дашборда клиента (ТЗ 7.2.1).
 *
 * Все выборки идут через фильтры видимости: клиент не должен видеть
 * ни чужие вакансии, ни кандидатов, которые ещё не представлены (BR-3).
 */
export async function getClientDashboardStats(
  actor: Actor,
): Promise<ClientDashboardStats> {
  const vacancies = visibleVacanciesFilter(actor);
  const applications = visibleApplicationsFilter(actor);

  const [activeVacancies, awaitingDecision, interviewsThisWeek, closedLast90Days] =
    await Promise.all([
      prisma.vacancy.count({ where: { ...vacancies, status: "ACTIVE" } }),

      // Представлены, но решение ещё не принято — главный призыв к действию
      prisma.application.count({
        where: {
          ...applications,
          presentedAt: { not: null },
          clientDecision: null,
          outcome: "IN_PROGRESS",
        },
      }),

      prisma.interview.count({
        where: {
          organizationId: actor.organizationId,
          vacancy: visibleVacanciesFilter(actor),
          status: "CONFIRMED",
          scheduledAt: { gte: new Date(), lte: inDays(7) },
        },
      }),

      prisma.vacancy.count({
        where: {
          ...vacancies,
          status: "CLOSED_SUCCESS",
          closedAt: { gte: inDays(-90) },
        },
      }),
    ]);

  return {
    activeVacancies,
    awaitingDecision,
    interviewsThisWeek,
    closedLast90Days,
  };
}

export type AgencyDashboardStats = {
  activeVacancies: number;
  candidatesInProgress: number;
  awaitingClientDecision: number;
  interviewsThisWeek: number;
  /** Вакансии в работе без ведущего — только для тех, кто назначает. */
  unassignedVacancies: number | null;
  /** Кандидаты, просрочившие норматив этапа — им же. */
  overdueStages: number | null;
  /** Вакансии, где актор в команде. */
  myVacancies: number;
  /** Договоры, ждущие подтверждения — только для тех, кто ведёт счета. */
  pendingAgreements: number | null;
  /** Выставленные счета, просроченные к оплате — им же. */
  overdueInvoices: number | null;
};

/**
 * Плитки дашборда агентства (ТЗ 7.3.1).
 *
 * Часть плиток зависит не от роли, а от права: тот, кто назначает
 * рекрутёров, отвечает за то, чтобы работа была распределена и не
 * стояла. Ему нужны «без рекрутёра» и «просрочено», и обе цифры до
 * этого не показывались нигде — вакансия могла уйти в работу без
 * ведущего, и заметить это было негде.
 *
 * Та же логика для того, кто ведёт договоры и счета: у него нет
 * вакансий в команде («Мои вакансии» была бы для него честным нулём
 * при любом раскладе), зато есть неподтверждённые договоры и
 * просроченные счета — обе цифры уже считаются на /a/clients
 * и /a/finance, просто до дашборда не доходили.
 */
export async function getAgencyDashboardStats(
  actor: Actor,
): Promise<AgencyDashboardStats> {
  const org = { organizationId: actor.organizationId };

  // Право, а не роль: «кто раздаёт работу», тот и отвечает за перекосы
  const manages = canDo(actor, "vacancy.assignRecruiter");
  // «Кто ведёт деньги» — тот же набор прав, что открывает раздел «Финансы»
  const managesBusiness = canDo(actor, "invoice.manage");

  const [
    activeVacancies,
    candidatesInProgress,
    awaitingClientDecision,
    interviewsThisWeek,
    myVacancies,
    unassignedVacancies,
    overdueStages,
    pendingAgreements,
    overdueInvoices,
  ] = await Promise.all([
    prisma.vacancy.count({ where: { ...org, status: "ACTIVE" } }),

    prisma.application.count({ where: { ...org, outcome: "IN_PROGRESS" } }),

    // То же, что видит клиент как «требует решения» — но по всему агентству.
    // Отсюда потом вырастет отчёт о просрочках клиента (BR-9).
    prisma.application.count({
      where: {
        ...org,
        presentedAt: { not: null },
        clientDecision: null,
        outcome: "IN_PROGRESS",
      },
    }),

    prisma.interview.count({
      where: {
        ...org,
        status: "CONFIRMED",
        scheduledAt: { gte: new Date(), lte: inDays(7) },
      },
    }),

    prisma.vacancy.count({
      where: { ...org, status: "ACTIVE", recruiterIds: { has: actor.id } },
    }),

    manages
      ? prisma.vacancy.count({
          where: { ...org, status: "ACTIVE", leadRecruiterId: null },
        })
      : Promise.resolve(null),

    manages ? countOverdueStages(actor) : Promise.resolve(null),

    managesBusiness
      ? prisma.agreement.count({ where: { ...org, status: "PENDING" } })
      : Promise.resolve(null),

    managesBusiness
      ? prisma.invoice.count({ where: { ...org, status: "OVERDUE" } })
      : Promise.resolve(null),
  ]);

  return {
    activeVacancies,
    candidatesInProgress,
    awaitingClientDecision,
    interviewsThisWeek,
    pendingAgreements,
    overdueInvoices,
    myVacancies,
    unassignedVacancies,
    overdueStages,
  };
}

/**
 * Кандидаты, застрявшие на этапе дольше норматива (BR-9).
 *
 * Считается в рабочих часах и потому в JS, а не запросом: норматив
 * не может быть выражен в SQL, не превратив пятничный вечер в
 * просрочку к утру понедельника.
 */
async function countOverdueStages(actor: Actor): Promise<number> {
  const inProgress = await prisma.application.findMany({
    where: {
      organizationId: actor.organizationId,
      outcome: "IN_PROGRESS",
      vacancy: { status: "ACTIVE" },
    },
    select: {
      stageEnteredAt: true,
      stage: { select: { slaHours: true } },
    },
  });

  return inProgress.filter((a) =>
    isOverdueBySla(a.stageEnteredAt, a.stage.slaHours),
  ).length;
}
