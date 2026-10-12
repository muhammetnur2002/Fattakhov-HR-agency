import { assertCanDo, visibleVacanciesFilter, type Actor } from "@/lib/access";
import { addDays, dateTimeLabel, dayKeyOf, startOfDay, DAY_MS } from "@/lib/calendar/moscow";
import {
  expandOccurrences,
  formatRule,
  isOccurrenceOf,
  parseRule,
  type TaskExceptionRow,
} from "@/lib/calendar/recurrence";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";

/**
 * Задачи в календаре агентства.
 *
 * Видимость (решение владельца):
 *  - задача, поставленная себе (исполнитель = постановщик), видна ТОЛЬКО этому человеку,
 *    даже владельцу;
 *  - задача, поставленная другому, видна постановщику, исполнителю и ролям с общим
 *    доступом (TASK_ADMIN_ROLES);
 *  - остальные сотрудники видят свои личные и назначенные им. Клиентские роли календарь
 *    задач не видят вовсе (assertCanDo "task.manage").
 *
 * Кому ставить: другому сотруднику могут только роли из TASK_ADMIN_ROLES, остальные
 * ставят задачи себе. Менять и удалять может постановщик и владелец; отмечать
 * выполненной: исполнитель, постановщик и владелец.
 *
 * Повторяющаяся задача хранится одной строкой, вхождения разворачиваются в запрошенном
 * диапазоне (lib/calendar/recurrence.ts). Правка и удаление: «только это», «это и
 * следующие», «все».
 */

export class TaskError extends Error {}

/**
 * Роли, которые видят все назначенные задачи агентства и могут ставить задачи другим.
 * Список вынесен в одну константу: расширить доступ (например, на ACCOUNT) значит
 * дописать роль сюда.
 */
export const TASK_ADMIN_ROLES = ["OWNER", "HEAD"] as const satisfies readonly UserRole[];

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;
const MAX_REMIND = 7 * 24 * 60;
/** Сколько задач отдаём за один запрос диапазона. */
const LIST_LIMIT = 2000;

export type TaskScope = "this" | "following" | "all";

export type TaskInput = {
  title: string;
  description?: string | null;
  startsAt: Date;
  durationMinutes?: number;
  /** Начало — это срок: «осталось», напоминание, просрочка. */
  hasDeadline?: boolean;
  /** Не передан: задача себе. */
  assigneeId?: string;
  /** null: не напоминать. Не передано: за час. */
  remindBeforeMinutes?: number | null;
  /** DAILY | WEEKLY:MO,WE | MONTHLY; пусто: не повторять. */
  recurrenceRule?: string | null;
  /** Последний день повторов включительно (любой момент этого дня по Москве). */
  recurrenceUntil?: Date | null;
  vacancyId?: string | null;
  candidateId?: string | null;
};

export type TaskRow = {
  id: string;
  /** Начало вхождения по правилу серии; для обычной задачи равно началу. Ключ для правки одного вхождения. */
  occurrence: Date;
  title: string;
  description: string | null;
  startsAt: Date;
  durationMinutes: number;
  hasDeadline: boolean;
  remindBeforeMinutes: number | null;
  recurrenceRule: string | null;
  recurrenceUntil: Date | null;
  /** Поставлена себе. */
  personal: boolean;
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

/** Видит ли человек все назначенные (не личные) задачи агентства. */
export function seesAllAssignedTasks(actor: { role: UserRole }): boolean {
  return (TASK_ADMIN_ROLES as readonly UserRole[]).includes(actor.role);
}

/** Можно ли постановщику назначить задачу этому человеку. */
export function canAssignTaskTo(
  actor: { id: string; role: UserRole },
  assignee: { id: string; role: UserRole },
): boolean {
  if (assignee.id === actor.id) return true;
  return seesAllAssignedTasks(actor);
}

/** Видна ли задача этому человеку (чистая версия условия taskVisibilityWhere). */
export function canSeeTask(
  actor: { id: string; role: UserRole },
  task: { assigneeId: string; createdById: string },
): boolean {
  if (task.assigneeId === actor.id) return true;
  // Личная задача (себе) видна только её владельцу: сюда доходят только чужие
  if (task.assigneeId === task.createdById) return false;
  return task.createdById === actor.id || seesAllAssignedTasks(actor);
}

/**
 * Условие выборки видимых задач для Prisma. Личные задачи (isPersonal) входят только
 * по исполнителю, то есть владельцу; общий доступ ролей их не охватывает.
 */
export function taskVisibilityWhere(actor: Actor): Prisma.CalendarTaskWhereInput {
  return {
    organizationId: actor.organizationId,
    OR: [
      { assigneeId: actor.id },
      { createdById: actor.id, isPersonal: false },
      ...(seesAllAssignedTasks(actor) ? [{ isPersonal: false }] : []),
    ],
  };
}

/** Права на конкретную задачу. */
export function taskPermissions(
  actor: { id: string; role: UserRole },
  task: { createdById: string; assigneeId: string },
): { edit: boolean; complete: boolean } {
  if (!canSeeTask(actor, task)) return { edit: false, complete: false };
  const edit = task.createdById === actor.id || actor.role === "OWNER";
  return { edit, complete: edit || task.assigneeId === actor.id };
}

function taskLink(startsAt: Date): string {
  return `/a/calendar?view=day&date=${dayKeyOf(startsAt)}`;
}

function cleanTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new TaskError("Напишите, что нужно сделать");
  if (title.length > MAX_TITLE) throw new TaskError(`Название длиннее ${MAX_TITLE} знаков`);
  return title;
}

function cleanDescription(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length > MAX_DESCRIPTION) throw new TaskError(`Описание длиннее ${MAX_DESCRIPTION} знаков`);
  return text || null;
}

function cleanStart(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TaskError("Укажите дату и время");
  }
  return value;
}

function cleanDuration(value: number | undefined): number {
  const minutes = value ?? 60;
  if (!Number.isInteger(minutes) || minutes < MIN_DURATION || minutes > MAX_DURATION) {
    throw new TaskError("Длительность от 5 минут до суток");
  }
  return minutes;
}

function cleanRemind(value: number | null | undefined, hasDeadline: boolean): number | null {
  if (!hasDeadline) return null;
  if (value === null) return null;
  const minutes = value ?? 60;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_REMIND) {
    throw new TaskError("Напоминание не раньше чем за неделю");
  }
  return minutes;
}

/** Правило повтора и последний день: проверка и приведение к каноническому виду. */
function cleanRecurrence(
  rule: string | null | undefined,
  until: Date | null | undefined,
  startsAt: Date,
): { rule: string | null; until: Date | null } {
  if (!rule) return { rule: null, until: null };
  const parsed = parseRule(rule);
  if (!parsed) throw new TaskError("Не удалось разобрать повторение");
  if (parsed.freq === "WEEKLY" && parsed.days.length === 0) {
    throw new TaskError("Выберите дни недели для повторения");
  }
  let lastDay: Date | null = null;
  if (until) {
    if (Number.isNaN(until.getTime())) throw new TaskError("Некорректная дата окончания повторов");
    lastDay = startOfDay(dayKeyOf(until));
    if (lastDay.getTime() < startOfDay(dayKeyOf(startsAt)).getTime()) {
      throw new TaskError("Повторы не могут заканчиваться раньше первой задачи");
    }
  }
  return { rule: formatRule(parsed), until: lastDay };
}

type Normalized = ReturnType<typeof normalizeInput>;

function normalizeInput(input: TaskInput) {
  const startsAt = cleanStart(input.startsAt);
  const hasDeadline = input.hasDeadline ?? false;
  return {
    title: cleanTitle(input.title),
    description: cleanDescription(input.description),
    startsAt,
    durationMinutes: cleanDuration(input.durationMinutes),
    hasDeadline,
    remind: cleanRemind(input.remindBeforeMinutes, hasDeadline),
    recurrence: cleanRecurrence(input.recurrenceRule, input.recurrenceUntil, startsAt),
    vacancyId: input.vacancyId || null,
    candidateId: input.candidateId || null,
  };
}

/** Люди, которым этот сотрудник может поставить задачу, он сам первым. */
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
    throw new TaskError("Ставить задачи другим сотрудникам могут только владелец и руководитель");
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
 * Запись в журнал действий. Только названия полей: заголовок и описание личной
 * задачи не должны попадать в журнал, который читают другие.
 */
async function logTask(actor: Actor, taskId: string, action: string, fields?: string[]) {
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "CalendarTask",
      entityId: taskId,
      action,
      ...(fields ? { diff: { fields } } : {}),
    },
  });
}

/**
 * Нужно ли при создании сразу считать напоминание отправленным: окно напоминания уже
 * началось, и сообщение «через 40 минут» сразу после постановки было бы шумом.
 */
function reminderStamp(startsAt: Date, remind: number | null, hasDeadline: boolean, now: Date): Date | null {
  if (!hasDeadline || remind === null) return null;
  return startsAt.getTime() - remind * 60_000 < now.getTime() ? now : null;
}

/** О просрочке сообщаем только обычным задачам с дедлайном, ещё не просроченным. */
function overdueStamp(startsAt: Date, hasDeadline: boolean, recurring: boolean, now: Date): Date | null {
  return !hasDeadline || recurring || startsAt < now ? now : null;
}

async function loadPeople(
  actor: Actor,
  tasks: { assigneeId: string; createdById: string; vacancyId: string | null; candidateId: string | null }[],
) {
  const userIds = [...new Set(tasks.flatMap((t) => [t.assigneeId, t.createdById]))];
  const vacancyIds = [...new Set(tasks.flatMap((t) => (t.vacancyId ? [t.vacancyId] : [])))];
  const candidateIds = [...new Set(tasks.flatMap((t) => (t.candidateId ? [t.candidateId] : [])))];

  const [users, vacancies, candidates] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
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
  return {
    userById: new Map(users.map((u) => [u.id, u])),
    vacancyById: new Map(vacancies.map((v) => [v.id, v])),
    candidateById: new Map(candidates.map((c) => [c.id, c])),
  };
}

type TaskWithExceptions = Prisma.CalendarTaskGetPayload<{ include: { exceptions: true } }>;

function toRows(
  actor: Actor,
  tasks: TaskWithExceptions[],
  people: Awaited<ReturnType<typeof loadPeople>>,
  range: { from: Date; to: Date } | null,
  now: Date,
): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const t of tasks) {
    const perms = taskPermissions(actor, t);
    const exceptions: TaskExceptionRow[] = t.exceptions;
    const occurrences = range
      ? expandOccurrences(
          { startsAt: t.dueAt, recurrenceRule: t.recurrenceRule, recurrenceUntil: t.recurrenceUntil, completedAt: t.completedAt },
          range.from,
          range.to,
          exceptions,
        )
      : [{ occurrenceDate: t.dueAt, startsAt: t.dueAt, completedAt: t.completedAt }];

    const vacancy = t.vacancyId ? people.vacancyById.get(t.vacancyId) : undefined;
    const candidate = t.candidateId ? people.candidateById.get(t.candidateId) : undefined;
    for (const occ of occurrences) {
      rows.push({
        id: t.id,
        occurrence: occ.occurrenceDate,
        title: t.title,
        description: t.description,
        startsAt: occ.startsAt,
        durationMinutes: t.durationMinutes,
        hasDeadline: t.hasDeadline,
        remindBeforeMinutes: t.remindBeforeMinutes,
        recurrenceRule: t.recurrenceRule,
        recurrenceUntil: t.recurrenceUntil,
        personal: t.isPersonal,
        completedAt: occ.completedAt,
        overdue: t.hasDeadline && !occ.completedAt && occ.startsAt < now,
        assignee: people.userById.get(t.assigneeId) ?? { id: t.assigneeId, fullName: "Сотрудник" },
        createdBy: people.userById.get(t.createdById) ?? { id: t.createdById, fullName: "Сотрудник" },
        vacancy: vacancy ? { id: vacancy.id, label: `№${vacancy.number} ${vacancy.title}` } : null,
        candidate: candidate ? { id: candidate.id, fullName: candidate.fullName } : null,
        canEdit: perms.edit,
        canComplete: perms.complete,
      });
    }
  }
  return rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Задачи на период [from, to): вхождения повторяющихся задач разворачиваются здесь,
 * в этом диапазоне, и нигде больше.
 */
export async function listTasks(actor: Actor, params: { from: Date; to: Date }): Promise<TaskRow[]> {
  assertCanDo(actor, "task.manage");
  const now = new Date();

  const tasks = await prisma.calendarTask.findMany({
    where: {
      AND: [
        taskVisibilityWhere(actor),
        {
          OR: [
            // Обычные: начало внутри периода
            { recurrenceRule: null, dueAt: { gte: params.from, lt: params.to } },
            // Повторяющиеся: серия началась до конца периода и не закончилась до его начала.
            // Запас в месяц: перенесённое вхождение может уйти за пределы правила
            {
              recurrenceRule: { not: null },
              dueAt: { lt: params.to },
              OR: [
                { recurrenceUntil: null },
                { recurrenceUntil: { gte: new Date(params.from.getTime() - 32 * DAY_MS) } },
              ],
            },
          ],
        },
      ],
    },
    orderBy: { dueAt: "asc" },
    take: LIST_LIMIT,
    include: { exceptions: true },
  });
  if (tasks.length === 0) return [];

  const people = await loadPeople(actor, tasks);
  return toRows(actor, tasks, people, params, now);
}

/**
 * Невыполненные просроченные задачи с дедлайном (обычные, не повторяющиеся).
 *
 * Они показываются всегда, даже если срок раньше начала периода: задача, о которой
 * забыли, не должна пропадать из списка только потому, что календарь листнули.
 */
export async function listOverdueTasks(actor: Actor, params: { before: Date; limit?: number }): Promise<TaskRow[]> {
  assertCanDo(actor, "task.manage");
  const now = new Date();
  const tasks = await prisma.calendarTask.findMany({
    where: {
      AND: [
        taskVisibilityWhere(actor),
        { hasDeadline: true, recurrenceRule: null, completedAt: null, dueAt: { lt: params.before } },
      ],
    },
    orderBy: { dueAt: "desc" },
    take: params.limit ?? 30,
    include: { exceptions: true },
  });
  if (tasks.length === 0) return [];
  const people = await loadPeople(actor, tasks);
  return toRows(actor, tasks, people, null, now);
}

/**
 * Ближайшие невыполненные задачи с дедлайном на два месяца вперёд (для плашки
 * «Ближайший дедлайн»): повторяющиеся тоже учитываются. Список, а не одна задача,
 * потому что плашка меняется вместе с фильтром «Мои / сотрудник» на клиенте.
 */
export async function upcomingDeadlines(actor: Actor, now: Date, limit = 30): Promise<TaskRow[]> {
  const rows = await listTasks(actor, { from: now, to: new Date(now.getTime() + 60 * DAY_MS) });
  return rows.filter((r) => r.hasDeadline && !r.completedAt && r.startsAt >= now).slice(0, limit);
}

async function loadTask(actor: Actor, taskId: string) {
  const task = await prisma.calendarTask.findFirst({
    where: { AND: [{ id: taskId }, taskVisibilityWhere(actor)] },
    include: { exceptions: true },
  });
  // Чужую личную задачу не отличаем от несуществующей
  if (!task) throw new TaskError("Задача не найдена");
  return task;
}

/** Проверка, что вхождение принадлежит серии (или уже имеет исключение). */
function requireOccurrence(task: TaskWithExceptions, occurrence: Date | undefined): Date {
  if (!occurrence || Number.isNaN(occurrence.getTime())) throw new TaskError("Не указано, какое повторение");
  const series = { startsAt: task.dueAt, recurrenceRule: task.recurrenceRule, recurrenceUntil: task.recurrenceUntil };
  const known = task.exceptions.some((e) => e.occurrenceDate.getTime() === occurrence.getTime());
  if (!known && !isOccurrenceOf(series, occurrence)) throw new TaskError("Такого повторения у задачи нет");
  return occurrence;
}

export async function createTask(actor: Actor, input: TaskInput): Promise<{ id: string }> {
  assertCanDo(actor, "task.manage");
  const next = normalizeInput(input);
  const assignee = await resolveAssignee(actor, input.assigneeId);
  await checkLinks(actor, next.vacancyId, next.candidateId);

  const now = new Date();
  const task = await prisma.calendarTask.create({
    data: {
      organizationId: actor.organizationId,
      title: next.title,
      description: next.description,
      dueAt: next.startsAt,
      durationMinutes: next.durationMinutes,
      hasDeadline: next.hasDeadline,
      assigneeId: assignee.id,
      createdById: actor.id,
      isPersonal: assignee.id === actor.id,
      vacancyId: next.vacancyId,
      candidateId: next.candidateId,
      remindBeforeMinutes: next.remind,
      recurrenceRule: next.recurrence.rule,
      recurrenceUntil: next.recurrence.until,
      reminderSentAt: reminderStamp(next.startsAt, next.remind, next.hasDeadline, now),
      overdueNotifiedAt: overdueStamp(next.startsAt, next.hasDeadline, Boolean(next.recurrence.rule), now),
    },
    select: { id: true },
  });
  await logTask(actor, task.id, "created");

  if (assignee.id !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [assignee.id],
      event: "TASK_ASSIGNED",
      title: `Вам поставили задачу: ${next.title}`,
      body: `Начало: ${dateTimeLabel(next.startsAt)}.`,
      linkUrl: taskLink(next.startsAt),
      groupKey: task.id,
    });
  }

  return task;
}

/** Совпадает ли всё, кроме времени начала и повторения: тогда перенос вхождения — просто исключение. */
function sameBody(before: TaskWithExceptions, next: Normalized, assigneeId: string): boolean {
  return (
    before.title === next.title &&
    before.description === next.description &&
    before.durationMinutes === next.durationMinutes &&
    before.hasDeadline === next.hasDeadline &&
    before.remindBeforeMinutes === next.remind &&
    before.assigneeId === assigneeId &&
    (before.vacancyId ?? null) === next.vacancyId &&
    (before.candidateId ?? null) === next.candidateId
  );
}

/**
 * Правка задачи.
 *
 * Для повторяющейся нужен `scope` и `occurrence` (какое вхождение открыл человек):
 *  - all: меняется вся серия; сдвиг начала переносится на первое вхождение;
 *  - following: серия обрывается накануне этого вхождения, с него начинается новая;
 *  - this: если изменилось только время — исключение с переносом, иначе вхождение
 *    отменяется и на его месте создаётся отдельная задача.
 * Возвращает id задачи, с которой теперь связано правленое (при расщеплении — новой).
 */
export async function updateTask(
  actor: Actor,
  taskId: string,
  input: TaskInput,
  options: { scope?: TaskScope; occurrence?: Date } = {},
): Promise<{ id: string }> {
  assertCanDo(actor, "task.manage");
  const before = await loadTask(actor, taskId);
  if (!taskPermissions(actor, before).edit) {
    throw new TaskError("Менять задачу может тот, кто её поставил, или владелец");
  }

  const next = normalizeInput(input);
  const assignee = await resolveAssignee(actor, input.assigneeId ?? before.assigneeId);
  await checkLinks(actor, next.vacancyId, next.candidateId);

  const recurring = Boolean(before.recurrenceRule);
  let scope: TaskScope = recurring ? (options.scope ?? "all") : "all";
  const now = new Date();
  const assigneeChanged = assignee.id !== before.assigneeId;
  const titleChanged = next.title !== before.title;
  const occurrence = recurring ? requireOccurrence(before, options.occurrence ?? before.dueAt) : before.dueAt;
  // С первого вхождения «это и следующие» означает всю серию
  if (scope === "following" && occurrence.getTime() === before.dueAt.getTime()) scope = "all";

  const startChanged = next.startsAt.getTime() !== occurrence.getTime();
  const fields = [
    ...(titleChanged ? ["title"] : []),
    ...(assigneeChanged ? ["assignee"] : []),
    ...(startChanged ? ["startsAt"] : []),
  ];
  const isPersonal = assignee.id === before.createdById;

  const baseData = (startsAt: Date) => ({
    title: next.title,
    description: next.description,
    dueAt: startsAt,
    durationMinutes: next.durationMinutes,
    hasDeadline: next.hasDeadline,
    assigneeId: assignee.id,
    isPersonal,
    vacancyId: next.vacancyId,
    candidateId: next.candidateId,
    remindBeforeMinutes: next.remind,
  });

  let resultId = taskId;

  if (scope === "all") {
    // Для серии сдвигаем первое вхождение на столько же, на сколько сдвинули открытое
    const startsAt = new Date(before.dueAt.getTime() + (next.startsAt.getTime() - occurrence.getTime()));
    const seriesChanged =
      before.recurrenceRule !== next.recurrence.rule || startsAt.getTime() !== before.dueAt.getTime();
    const resetTimers = seriesChanged || assigneeChanged || next.remind !== before.remindBeforeMinutes;
    await prisma.$transaction(async (tx) => {
      await tx.calendarTask.update({
        where: { id: taskId },
        data: {
          ...baseData(startsAt),
          recurrenceRule: next.recurrence.rule,
          recurrenceUntil: next.recurrence.until,
          // Время, исполнитель или напоминание сменились: отсчёт напоминаний начинается заново
          ...(resetTimers
            ? {
                reminderSentAt: reminderStamp(startsAt, next.remind, next.hasDeadline, now),
                overdueNotifiedAt: overdueStamp(startsAt, next.hasDeadline, Boolean(next.recurrence.rule), now),
              }
            : {}),
        },
      });
      // Правило или начало серии сменились: прежние исключения указывают на несуществующие даты
      if (recurring && seriesChanged) await tx.calendarTaskException.deleteMany({ where: { taskId } });
    });
  } else if (scope === "following") {
    resultId = await prisma.$transaction(async (tx) => {
      await tx.calendarTask.update({
        where: { id: taskId },
        data: { recurrenceUntil: startOfDay(addDays(dayKeyOf(occurrence), -1)) },
      });
      const created = await tx.calendarTask.create({
        data: {
          organizationId: actor.organizationId,
          ...baseData(next.startsAt),
          createdById: before.createdById,
          recurrenceRule: next.recurrence.rule,
          // Конец серии, если человек его не задавал, остаётся прежним
          recurrenceUntil: next.recurrence.until ?? before.recurrenceUntil,
          reminderSentAt: reminderStamp(next.startsAt, next.remind, next.hasDeadline, now),
          overdueNotifiedAt: now,
        },
        select: { id: true },
      });
      // Исключения от этого вхождения и дальше относятся к новой серии, если даты не уехали
      const tail = { taskId, occurrenceDate: { gte: occurrence } };
      if (before.recurrenceRule === next.recurrence.rule && !startChanged) {
        await tx.calendarTaskException.updateMany({ where: tail, data: { taskId: created.id } });
      } else {
        await tx.calendarTaskException.deleteMany({ where: tail });
      }
      return created.id;
    });
  } else if (sameBody(before, next, assignee.id)) {
    // Изменилось только время вхождения: перенос без новой задачи
    await prisma.calendarTaskException.upsert({
      where: { taskId_occurrenceDate: { taskId, occurrenceDate: occurrence } },
      create: { taskId, occurrenceDate: occurrence, movedToStartsAt: next.startsAt },
      update: { movedToStartsAt: next.startsAt, cancelled: false },
    });
  } else {
    resultId = await prisma.$transaction(async (tx) => {
      await tx.calendarTaskException.upsert({
        where: { taskId_occurrenceDate: { taskId, occurrenceDate: occurrence } },
        create: { taskId, occurrenceDate: occurrence, cancelled: true },
        update: { cancelled: true, movedToStartsAt: null },
      });
      const created = await tx.calendarTask.create({
        data: {
          organizationId: actor.organizationId,
          ...baseData(next.startsAt),
          createdById: before.createdById,
          // Отдельное вхождение больше не повторяется
          recurrenceRule: null,
          recurrenceUntil: null,
          reminderSentAt: reminderStamp(next.startsAt, next.remind, next.hasDeadline, now),
          overdueNotifiedAt: overdueStamp(next.startsAt, next.hasDeadline, false, now),
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  await logTask(actor, resultId, "updated", fields);

  // Завершённой обычной задаче уведомления не нужны
  if (!recurring && before.completedAt) return { id: resultId };

  if (assigneeChanged) {
    if (before.assigneeId !== actor.id) {
      await notify({
        organizationId: actor.organizationId,
        userIds: [before.assigneeId],
        event: "TASK_CANCELLED",
        title: `Задача передана другому: ${before.title}`,
        linkUrl: taskLink(before.dueAt),
        groupKey: taskId,
      });
    }
    if (assignee.id !== actor.id) {
      await notify({
        organizationId: actor.organizationId,
        userIds: [assignee.id],
        event: "TASK_ASSIGNED",
        title: `Вам поставили задачу: ${next.title}`,
        body: `Начало: ${dateTimeLabel(next.startsAt)}.`,
        linkUrl: taskLink(next.startsAt),
        groupKey: resultId,
      });
    }
  } else if ((startChanged || titleChanged) && assignee.id !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [assignee.id],
      event: "TASK_CHANGED",
      title: `Задача изменена: ${next.title}`,
      body: `Начало: ${dateTimeLabel(next.startsAt)}.`,
      linkUrl: taskLink(next.startsAt),
      groupKey: resultId,
    });
  }

  return { id: resultId };
}

/** Отметить выполненной или вернуть в работу. У повторяющейся отмечается одно вхождение. */
export async function setTaskDone(
  actor: Actor,
  taskId: string,
  done: boolean,
  options: { occurrence?: Date } = {},
): Promise<void> {
  assertCanDo(actor, "task.manage");
  const task = await loadTask(actor, taskId);
  if (!taskPermissions(actor, task).complete) {
    throw new TaskError("Отметить выполненной может исполнитель или постановщик");
  }

  if (task.recurrenceRule) {
    const occurrence = requireOccurrence(task, options.occurrence);
    await prisma.calendarTaskException.upsert({
      where: { taskId_occurrenceDate: { taskId, occurrenceDate: occurrence } },
      create: { taskId, occurrenceDate: occurrence, completedAt: done ? new Date() : null },
      update: { completedAt: done ? new Date() : null },
    });
  } else {
    if (Boolean(task.completedAt) === done) return;
    await prisma.calendarTask.update({
      where: { id: taskId },
      data: done
        ? { completedAt: new Date(), completedById: actor.id }
        : { completedAt: null, completedById: null },
    });
  }
  await logTask(actor, taskId, done ? "completed" : "reopened");

  if (done && task.createdById !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [task.createdById],
      event: "TASK_COMPLETED",
      title: `Задача выполнена: ${task.title}`,
      linkUrl: taskLink(options.occurrence ?? task.dueAt),
      groupKey: taskId,
    });
  }
}

/** Удаление: «только это», «это и следующие» или «все» вхождения. */
export async function deleteTask(
  actor: Actor,
  taskId: string,
  options: { scope?: TaskScope; occurrence?: Date } = {},
): Promise<void> {
  assertCanDo(actor, "task.manage");
  const task = await loadTask(actor, taskId);
  if (!taskPermissions(actor, task).edit) {
    throw new TaskError("Удалить задачу может тот, кто её поставил, или владелец");
  }

  const scope: TaskScope = task.recurrenceRule ? (options.scope ?? "all") : "all";
  let removedAll = true;

  if (task.recurrenceRule && scope !== "all") {
    const occurrence = requireOccurrence(task, options.occurrence);
    if (scope === "this") {
      await prisma.calendarTaskException.upsert({
        where: { taskId_occurrenceDate: { taskId, occurrenceDate: occurrence } },
        create: { taskId, occurrenceDate: occurrence, cancelled: true },
        update: { cancelled: true, movedToStartsAt: null },
      });
      removedAll = false;
    } else if (occurrence.getTime() > task.dueAt.getTime()) {
      // Это и следующие: серия заканчивается накануне, хвост исключений больше не нужен
      await prisma.$transaction([
        prisma.calendarTask.update({
          where: { id: taskId },
          data: { recurrenceUntil: startOfDay(addDays(dayKeyOf(occurrence), -1)) },
        }),
        prisma.calendarTaskException.deleteMany({ where: { taskId, occurrenceDate: { gte: occurrence } } }),
      ]);
      removedAll = false;
    }
    // Первое вхождение и «следующие» — это вся серия, как «все»
  }

  if (removedAll) await prisma.calendarTask.delete({ where: { id: taskId } });
  await logTask(actor, taskId, "deleted", [scope]);

  if (!task.completedAt && task.assigneeId !== actor.id) {
    await notify({
      organizationId: actor.organizationId,
      userIds: [task.assigneeId],
      event: "TASK_CANCELLED",
      title: `Задача отменена: ${task.title}`,
      linkUrl: "/a/calendar",
      groupKey: taskId,
    });
  }
}
