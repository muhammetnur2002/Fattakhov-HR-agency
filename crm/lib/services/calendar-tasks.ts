import { assertCanDo, visibleVacanciesFilter, type Actor } from "@/lib/access";
import { toDateParam } from "@/lib/calendar/day-range";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";

/**
 * Задания в календаре агентства.
 *
 * Сотрудник ставит задание себе или, по правилам ролей, коллеге; исполнитель
 * отмечает выполненным. На каждое событие (поставили, изменили, отменили,
 * выполнено, за 15 минут до срока, просрочено) уходит уведомление; рассылка
 * по времени живёт в jobs/tasks.ts.
 *
 * Кто кому ставит (решение владельца):
 *  - владелец: любому сотруднику агентства;
 *  - руководитель подбора и менеджер по работе с клиентами: рекрутёрам и себе;
 *  - рекрутёр: только себе.
 *
 * Кто что видит: владелец и руководитель подбора видят все задания агентства,
 * остальные только свои и поставленные ими. Менять и удалять может постановщик
 * и владелец; отметить выполненным: исполнитель, постановщик и владелец.
 * Руководитель чужие задания только видит: править личное задание владельца
 * или соседа он не должен.
 */

export class TaskError extends Error {}

const MAX_TITLE = 200;

export type TaskInput = {
  title: string;
  dueAt: Date;
  /** Не передан: задание себе. */
  assigneeId?: string;
  vacancyId?: string | null;
  candidateId?: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  dueAt: Date;
  completedAt: Date | null;
  overdue: boolean;
  assignee: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
  vacancy: { id: string; label: string } | null;
  candidate: { id: string; fullName: string } | null;
  canEdit: boolean;
  canComplete: boolean;
};

export type AssigneeOption = { id: string; fullName: string; role: UserRole };

/** Можно ли постановщику назначить задание этому человеку. */
export function canAssignTaskTo(
  actor: { id: string; role: UserRole },
  assignee: { id: string; role: UserRole },
): boolean {
  if (assignee.id === actor.id) return true;
  if (actor.role === "OWNER") return true;
  if (actor.role === "HEAD" || actor.role === "ACCOUNT") return assignee.role === "RECRUITER";
  return false;
}

/** Все ли задания агентства видит этот человек. */
export function seesAllTasks(actor: { role: UserRole }): boolean {
  return actor.role === "OWNER" || actor.role === "HEAD";
}

/** Права на конкретное задание. */
export function taskPermissions(
  actor: { id: string; role: UserRole },
  task: { createdById: string; assigneeId: string },
): { edit: boolean; complete: boolean } {
  const edit = task.createdById === actor.id || actor.role === "OWNER";
  return { edit, complete: edit || task.assigneeId === actor.id };
}

/** Срок для текста уведомления: по Москве, как остальные тексты кабинета. */
function whenText(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function taskLink(dueAt: Date): string {
  return `/a/calendar?range=day&date=${toDateParam(dueAt)}`;
}

function cleanTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new TaskError("Напишите, что нужно сделать");
  if (title.length > MAX_TITLE) throw new TaskError(`Название длиннее ${MAX_TITLE} знаков`);
  return title;
}

function cleanDue(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TaskError("Укажите дату и время");
  }
  return value;
}

/** Люди, которым этот сотрудник может поставить задание, он сам первым. */
export async function listAssignableUsers(actor: Actor): Promise<AssigneeOption[]> {
  assertCanDo(actor, "task.manage");
  const users = await prisma.user.findMany({
    where: { organizationId: actor.organizationId, clientId: null, isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });
  const allowed = users.filter((u) => canAssignTaskTo(actor, u));
  return [...allowed.filter((u) => u.id === actor.id), ...allowed.filter((u) => u.id !== actor.id)];
}

async function resolveAssignee(actor: Actor, assigneeId: string | undefined) {
  const id = assigneeId || actor.id;
  const user = await prisma.user.findFirst({
    where: { id, organizationId: actor.organizationId, clientId: null, isActive: true },
    select: { id: true, fullName: true, role: true },
  });
  if (!user) throw new TaskError("Исполнитель не найден среди сотрудников агентства");
  if (!canAssignTaskTo(actor, user)) {
    throw new TaskError("Вам нельзя ставить задание этому сотруднику");
  }
  return user;
}

async function checkLinks(actor: Actor, vacancyId?: string | null, candidateId?: string | null) {
  if (vacancyId) {
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: vacancyId, ...visibleVacanciesFilter(actor) },
      select: { id: true },
    });
    if (!vacancy) throw new TaskError("Вакансия не найдена");
  }
  if (candidateId) {
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!candidate) throw new TaskError("Кандидат не найден");
  }
}

/**
 * Задания на период и просроченные невыполненные.
 *
 * Просроченное невыполненное показывается всегда, даже если срок раньше
 * начала периода: задача, о которой забыли, не должна пропадать из списка
 * только потому, что календарь листнули вперёд.
 */
export async function listTasks(actor: Actor, params: { from: Date; to: Date }): Promise<TaskRow[]> {
  assertCanDo(actor, "task.manage");
  const now = new Date();

  const tasks = await prisma.calendarTask.findMany({
    where: {
      organizationId: actor.organizationId,
      AND: [
        seesAllTasks(actor)
          ? {}
          : { OR: [{ assigneeId: actor.id }, { createdById: actor.id }] },
        {
          OR: [
            { dueAt: { gte: params.from, lt: params.to } },
            { dueAt: { lt: params.from }, completedAt: null },
          ],
        },
      ],
    },
    orderBy: { dueAt: "asc" },
    take: 300,
  });
  if (tasks.length === 0) return [];

  const userIds = [...new Set(tasks.flatMap((t) => [t.assigneeId, t.createdById]))];
  const vacancyIds = [...new Set(tasks.flatMap((t) => (t.vacancyId ? [t.vacancyId] : [])))];
  const candidateIds = [...new Set(tasks.flatMap((t) => (t.candidateId ? [t.candidateId] : [])))];

  const [users, vacancies, candidates] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    vacancyIds.length
      ? prisma.vacancy.findMany({
          where: { id: { in: vacancyIds }, ...visibleVacanciesFilter(actor) },
          select: { id: true, number: true, title: true },
        })
      : Promise.resolve([]),
    candidateIds.length
      ? prisma.candidate.findMany({
          where: { id: { in: candidateIds }, organizationId: actor.organizationId },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const vacancyById = new Map(vacancies.map((v) => [v.id, v]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  return tasks.map((t) => {
    const perms = taskPermissions(actor, t);
    const vacancy = t.vacancyId ? vacancyById.get(t.vacancyId) : undefined;
    const candidate = t.candidateId ? candidateById.get(t.candidateId) : undefined;
    return {
      id: t.id,
      title: t.title,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      overdue: !t.completedAt && t.dueAt < now,
      assignee: userById.get(t.assigneeId) ?? { id: t.assigneeId, fullName: "Сотрудник" },
      createdBy: userById.get(t.createdById) ?? { id: t.createdById, fullName: "Сотрудник" },
      vacancy: vacancy ? { id: vacancy.id, label: `№${vacancy.number} ${vacancy.title}` } : null,
      candidate: candidate ? { id: candidate.id, fullName: candidate.fullName } : null,
      canEdit: perms.edit,
      canComplete: perms.complete,
    };
  });
}

export async function createTask(actor: Actor, input: TaskInput): Promise<{ id: string }> {
  assertCanDo(actor, "task.manage");
  const title = cleanTitle(input.title);
  const dueAt = cleanDue(input.dueAt);
  const assignee = await resolveAssignee(actor, input.assigneeId);
  await checkLinks(actor, input.vacancyId, input.candidateId);

  const now = new Date();
  const task = await prisma.calendarTask.create({
    data: {
      organizationId: actor.organizationId,
      title,
      dueAt,
      assigneeId: assignee.id,
      createdById: actor.id,
      vacancyId: input.vacancyId || null,
      candidateId: input.candidateId || null,
      // Срок уже прошёл или наступит в ближайшие 15 минут: напоминание и
      // сообщение о просрочке при создании были бы шумом, их не посылаем
      reminderSentAt: dueAt.getTime() - 15 * 60_000 < now.getTime() ? now : null,
      overdueNotifiedAt: dueAt < now ? now : null,
    },
    select: { id: true },
  });

  if (assignee.id !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [assignee.id],
      event: "TASK_ASSIGNED",
      title: `Вам поставили задание: ${title}`,
      body: `Срок: ${whenText(dueAt)}.`,
      linkUrl: taskLink(dueAt),
      groupKey: task.id,
    });
  }

  return task;
}

export async function updateTask(actor: Actor, taskId: string, input: TaskInput): Promise<void> {
  assertCanDo(actor, "task.manage");
  const before = await prisma.calendarTask.findFirst({
    where: { id: taskId, organizationId: actor.organizationId },
  });
  if (!before) throw new TaskError("Задание не найдено");
  if (!taskPermissions(actor, before).edit) throw new TaskError("Менять задание может тот, кто его поставил, или владелец");

  const title = cleanTitle(input.title);
  const dueAt = cleanDue(input.dueAt);
  const assignee = await resolveAssignee(actor, input.assigneeId ?? before.assigneeId);
  await checkLinks(actor, input.vacancyId, input.candidateId);

  const dueChanged = dueAt.getTime() !== before.dueAt.getTime();
  const titleChanged = title !== before.title;
  const assigneeChanged = assignee.id !== before.assigneeId;
  const now = new Date();

  await prisma.calendarTask.update({
    where: { id: taskId },
    data: {
      title,
      dueAt,
      assigneeId: assignee.id,
      vacancyId: input.vacancyId || null,
      candidateId: input.candidateId || null,
      // Срок или исполнитель сменились: напоминания и «просрочено» отсчитываются заново
      ...(dueChanged || assigneeChanged
        ? {
            reminderSentAt: dueAt.getTime() - 15 * 60_000 < now.getTime() ? now : null,
            overdueNotifiedAt: dueAt < now ? now : null,
          }
        : {}),
    },
  });

  if (before.completedAt) return;

  if (assigneeChanged) {
    if (before.assigneeId !== actor.id) {
      await notify({
        organizationId: actor.organizationId,
        userIds: [before.assigneeId],
        event: "TASK_CANCELLED",
        title: `Задание передано другому: ${before.title}`,
        linkUrl: taskLink(before.dueAt),
        groupKey: taskId,
      });
    }
    if (assignee.id !== actor.id) {
      await notify({
        organizationId: actor.organizationId,
        userIds: [assignee.id],
        event: "TASK_ASSIGNED",
        title: `Вам поставили задание: ${title}`,
        body: `Срок: ${whenText(dueAt)}.`,
        linkUrl: taskLink(dueAt),
        groupKey: taskId,
      });
    }
  } else if ((dueChanged || titleChanged) && assignee.id !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [assignee.id],
      event: "TASK_CHANGED",
      title: `Задание изменено: ${title}`,
      body: `Срок: ${whenText(dueAt)}.`,
      linkUrl: taskLink(dueAt),
      groupKey: taskId,
    });
  }
}

/** Отметить выполненным или вернуть в работу. */
export async function setTaskDone(actor: Actor, taskId: string, done: boolean): Promise<void> {
  assertCanDo(actor, "task.manage");
  const task = await prisma.calendarTask.findFirst({
    where: { id: taskId, organizationId: actor.organizationId },
  });
  if (!task) throw new TaskError("Задание не найдено");
  if (!taskPermissions(actor, task).complete) throw new TaskError("Отметить выполненным может исполнитель или постановщик");
  if (Boolean(task.completedAt) === done) return;

  await prisma.calendarTask.update({
    where: { id: taskId },
    data: done
      ? { completedAt: new Date(), completedById: actor.id }
      : { completedAt: null, completedById: null },
  });

  if (done && task.createdById !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [task.createdById],
      event: "TASK_COMPLETED",
      title: `Задание выполнено: ${task.title}`,
      linkUrl: taskLink(task.dueAt),
      groupKey: taskId,
    });
  }
}

export async function deleteTask(actor: Actor, taskId: string): Promise<void> {
  assertCanDo(actor, "task.manage");
  const task = await prisma.calendarTask.findFirst({
    where: { id: taskId, organizationId: actor.organizationId },
  });
  if (!task) throw new TaskError("Задание не найдено");
  if (!taskPermissions(actor, task).edit) throw new TaskError("Удалить задание может тот, кто его поставил, или владелец");

  await prisma.calendarTask.delete({ where: { id: taskId } });

  if (!task.completedAt && task.assigneeId !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [task.assigneeId],
      event: "TASK_CANCELLED",
      title: `Задание отменено: ${task.title}`,
      linkUrl: "/a/calendar",
      groupKey: taskId,
    });
  }
}
