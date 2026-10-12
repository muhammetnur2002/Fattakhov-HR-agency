import { assertCanDo, AccessDeniedError, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { presentationQuality } from "./metrics";
import type { Period } from "./queries";

/**
 * Аналитика по сотрудникам агентства.
 *
 * Владелец и руководитель подбора видят всех, остальные сотрудники — только
 * себя. Чужую страницу рекрутёр не открывает ни по ссылке, ни через список:
 * отказ даёт сервис, а не только скрытая кнопка.
 *
 * Бейдж «Финал»: кандидаты сотрудника, которые сейчас на этапе FINAL и ещё в
 * работе. Показываем число и до трёх имён: на странице списка достаточно
 * увидеть, у кого уже есть финалисты.
 */

export const EMPLOYEE_ROLES: UserRole[] = ["HEAD", "RECRUITER", "ACCOUNT"];

/** Сколько имён финалистов показываем рядом с бейджем. */
export const FINALISTS_PREVIEW = 3;

export type FinalistRow = {
  applicationId: string;
  candidateId: string;
  fullName: string;
  vacancyNumber: number;
  vacancyTitle: string;
};

export type EmployeeStats = {
  id: string;
  fullName: string;
  role: UserRole;
  position: string | null;
  activeVacancies: number;
  activeCandidates: number;
  /** Новые кандидаты в базе, добавленные сотрудником за период. */
  candidatesAdded: number;
  presented: number;
  quality: number | null;
  hired: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDone: number;
  finalists: FinalistRow[];
};

/** Кого вообще можно показывать этому человеку. */
function visibleEmployeeIds(actor: Actor): "all" | string[] {
  if (actor.role === "OWNER" || actor.role === "HEAD") return "all";
  return [actor.id];
}

async function statsFor(
  actor: Actor,
  users: { id: string; fullName: string; role: UserRole; position: string | null }[],
  period: Period,
): Promise<EmployeeStats[]> {
  const orgId = actor.organizationId;
  const now = new Date();

  return Promise.all(
    users.map(async (user) => {
      const [
        activeVacancies,
        activeCandidates,
        candidatesAdded,
        presented,
        interviewed,
        hired,
        tasksOpen,
        tasksOverdue,
        tasksDone,
        finalApps,
      ] = await Promise.all([
        prisma.vacancy.count({
          where: { organizationId: orgId, status: "ACTIVE", recruiterIds: { has: user.id } },
        }),
        prisma.application.count({
          where: { organizationId: orgId, ownerId: user.id, outcome: "IN_PROGRESS" },
        }),
        prisma.candidate.count({
          where: {
            organizationId: orgId,
            createdById: user.id,
            createdAt: { gte: period.from, lte: period.to },
          },
        }),
        prisma.application.count({
          where: {
            organizationId: orgId,
            presentedById: user.id,
            presentedAt: { gte: period.from, lte: period.to },
          },
        }),
        prisma.application.count({
          where: {
            organizationId: orgId,
            presentedById: user.id,
            presentedAt: { gte: period.from, lte: period.to },
            interviews: { some: {} },
          },
        }),
        prisma.application.count({
          where: {
            organizationId: orgId,
            ownerId: user.id,
            hiredAt: { gte: period.from, lte: period.to },
          },
        }),
        prisma.calendarTask.count({
          where: { organizationId: orgId, assigneeId: user.id, completedAt: null },
        }),
        prisma.calendarTask.count({
          where: {
            organizationId: orgId,
            assigneeId: user.id,
            completedAt: null,
            dueAt: { lt: now },
          },
        }),
        prisma.calendarTask.count({
          where: {
            organizationId: orgId,
            assigneeId: user.id,
            completedAt: { gte: period.from, lte: period.to },
          },
        }),
        prisma.application.findMany({
          where: {
            organizationId: orgId,
            ownerId: user.id,
            outcome: "IN_PROGRESS",
            stage: { code: "FINAL" },
          },
          orderBy: { stageEnteredAt: "desc" },
          select: {
            id: true,
            candidate: { select: { id: true, fullName: true } },
            vacancy: { select: { number: true, title: true } },
          },
        }),
      ]);

      return {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        position: user.position,
        activeVacancies,
        activeCandidates,
        candidatesAdded,
        presented,
        quality: presentationQuality(presented, interviewed),
        hired,
        tasksOpen,
        tasksOverdue,
        tasksDone,
        finalists: finalApps.map((a) => ({
          applicationId: a.id,
          candidateId: a.candidate.id,
          fullName: a.candidate.fullName,
          vacancyNumber: a.vacancy.number,
          vacancyTitle: a.vacancy.title,
        })),
      };
    }),
  );
}

/** Список сотрудников для таблицы внизу страницы аналитики. */
export async function listEmployeeStats(
  actor: Actor,
  period: Period,
): Promise<EmployeeStats[]> {
  assertCanDo(actor, "analytics.employee");

  const visible = visibleEmployeeIds(actor);
  const users = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      isActive: true,
      role: { in: EMPLOYEE_ROLES },
      ...(visible === "all" ? {} : { id: { in: visible } }),
    },
    select: { id: true, fullName: true, role: true, position: true },
    orderBy: { fullName: "asc" },
  });

  return statsFor(actor, users, period);
}

/** Аналитика одного сотрудника; чужого рекрутёру не отдаём. */
export async function getEmployeeStats(
  actor: Actor,
  employeeId: string,
  period: Period,
): Promise<EmployeeStats | null> {
  assertCanDo(actor, "analytics.employee");

  const visible = visibleEmployeeIds(actor);
  if (visible !== "all" && !visible.includes(employeeId)) {
    throw new AccessDeniedError("analytics.employee");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: employeeId,
      organizationId: actor.organizationId,
      isActive: true,
      role: { in: EMPLOYEE_ROLES },
    },
    select: { id: true, fullName: true, role: true, position: true },
  });
  if (!user) return null;

  const [stats] = await statsFor(actor, [user], period);
  return stats;
}

export type EmployeeVacancyRow = {
  id: string;
  number: number;
  title: string;
  clientName: string;
  inWork: number;
  presented: number;
};

/** Активные вакансии сотрудника — ниже общей карточки на его странице. */
export async function employeeVacancies(
  actor: Actor,
  employeeId: string,
): Promise<EmployeeVacancyRow[]> {
  assertCanDo(actor, "analytics.employee");
  const visible = visibleEmployeeIds(actor);
  if (visible !== "all" && !visible.includes(employeeId)) {
    throw new AccessDeniedError("analytics.employee");
  }

  const vacancies = await prisma.vacancy.findMany({
    where: {
      organizationId: actor.organizationId,
      status: "ACTIVE",
      recruiterIds: { has: employeeId },
    },
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      client: { select: { name: true } },
      applications: {
        select: { outcome: true, presentedAt: true },
      },
    },
  });

  return vacancies.map((v) => ({
    id: v.id,
    number: v.number,
    title: v.title,
    clientName: v.client.name,
    inWork: v.applications.filter((a) => a.outcome === "IN_PROGRESS").length,
    presented: v.applications.filter((a) => a.presentedAt !== null).length,
  }));
}
