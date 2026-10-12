/**
 * Задачи в календаре: видимость (личная — только владельцу, назначенная — автору,
 * исполнителю, OWNER и HEAD), кто кому ставит, повторения с исключениями,
 * уведомления на каждое событие и рассылка по времени (напоминание, просрочка).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const notifyMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/notifications/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/notify")>()),
  notify: notifyMock,
}));

import { notifyOverdueTasks, sendTaskReminders } from "@/jobs/tasks";
import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  canAssignTaskTo,
  canSeeTask,
  createTask,
  deleteTask,
  listAssignableUsers,
  listOverdueTasks,
  listTasks,
  seesAllAssignedTasks,
  setTaskDone,
  TASK_ADMIN_ROLES,
  TaskError,
  taskPermissions,
  updateTask,
  upcomingDeadlines,
} from "@/lib/services/calendar-tasks";

const ORG = "org_fattakhov";
const MARK = "test_ctask_";
const H = 3_600_000;

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const head: Actor = { id: "usr_head", organizationId: ORG, role: "HEAD", clientId: null };
const account: Actor = { id: "usr_account", organizationId: ORG, role: "ACCOUNT", clientId: null };
const rec1: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const rec2: Actor = { id: "usr_rec2", organizationId: ORG, role: "RECRUITER", clientId: null };
const client: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

const future = (hours: number) => new Date(Date.now() + hours * H);
/** Понедельник 2030-03-04 10:00 по Москве: далеко в будущем, чтобы «сейчас» не мешало. */
const MON = new Date("2030-03-04T07:00:00Z");
const DAY = 24 * H;

async function cleanup() {
  await db.calendarTask.deleteMany({ where: { title: { startsWith: MARK } } });
}

type NotifyArg = { event: string; userIds: string[]; title: string };
const calls = () => notifyMock.mock.calls.map((c) => (c as unknown as [NotifyArg])[0]);

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(async () => {
  await cleanup();
  notifyMock.mockClear();
});

describe("правила ролей", () => {
  it("общий доступ задан одной константой: OWNER и HEAD", () => {
    expect([...TASK_ADMIN_ROLES]).toEqual(["OWNER", "HEAD"]);
    expect(seesAllAssignedTasks(owner)).toBe(true);
    expect(seesAllAssignedTasks(head)).toBe(true);
    expect(seesAllAssignedTasks(account)).toBe(false);
    expect(seesAllAssignedTasks(rec1)).toBe(false);
  });

  it("другим ставят только OWNER и HEAD, остальные только себе", () => {
    expect(canAssignTaskTo(owner, rec1)).toBe(true);
    expect(canAssignTaskTo(owner, head)).toBe(true);
    expect(canAssignTaskTo(head, rec1)).toBe(true);
    expect(canAssignTaskTo(head, owner)).toBe(true);
    expect(canAssignTaskTo(account, rec1)).toBe(false);
    expect(canAssignTaskTo(account, account)).toBe(true);
    expect(canAssignTaskTo(rec1, rec2)).toBe(false);
    expect(canAssignTaskTo(rec1, head)).toBe(false);
    expect(canAssignTaskTo(rec1, rec1)).toBe(true);
  });

  it("canSeeTask: личная только владельцу, назначенная автору, исполнителю и OWNER/HEAD", () => {
    const personal = { createdById: rec1.id, assigneeId: rec1.id };
    expect(canSeeTask(rec1, personal)).toBe(true);
    expect(canSeeTask(owner, personal)).toBe(false);
    expect(canSeeTask(head, personal)).toBe(false);
    expect(canSeeTask(rec2, personal)).toBe(false);

    const assigned = { createdById: head.id, assigneeId: rec1.id };
    expect(canSeeTask(head, assigned)).toBe(true);
    expect(canSeeTask(rec1, assigned)).toBe(true);
    expect(canSeeTask(owner, assigned)).toBe(true);
    expect(canSeeTask(account, assigned)).toBe(false);
    expect(canSeeTask(rec2, assigned)).toBe(false);
  });

  it("менять может постановщик и владелец, отмечать ещё и исполнитель; чужая личная не доступна", () => {
    const task = { createdById: head.id, assigneeId: rec1.id };
    expect(taskPermissions(head, task)).toEqual({ edit: true, complete: true });
    expect(taskPermissions(rec1, task)).toEqual({ edit: false, complete: true });
    expect(taskPermissions(owner, task)).toEqual({ edit: true, complete: true });
    expect(taskPermissions(rec2, task)).toEqual({ edit: false, complete: false });
    // Личная задача владельца: руководителю она не видна, значит и прав нет
    expect(taskPermissions(head, { createdById: owner.id, assigneeId: owner.id })).toEqual({ edit: false, complete: false });
    // Владелец чужую личную тоже не правит
    expect(taskPermissions(owner, { createdById: rec1.id, assigneeId: rec1.id })).toEqual({ edit: false, complete: false });
  });

  it("список тех, кому можно поставить: рекрутёру и менеджеру только они сами, OWNER и HEAD всем", async () => {
    expect((await listAssignableUsers(rec1)).map((u) => u.id)).toEqual(["usr_rec1"]);
    expect((await listAssignableUsers(account)).map((u) => u.id)).toEqual(["usr_account"]);

    for (const actor of [owner, head]) {
      const list = await listAssignableUsers(actor);
      expect(list[0].id).toBe(actor.id);
      expect(list.map((u) => u.id)).toEqual(expect.arrayContaining(["usr_owner", "usr_head", "usr_account", "usr_rec1"]));
      expect(list.every((u) => !u.role.startsWith("CLIENT_"))).toBe(true);
    }
    await expect(listAssignableUsers(client)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("постановка задачи", () => {
  it("себе: уведомления нет, задача помечена личной, в журнале запись без названия", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}себе`, startsAt: future(3) });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.assigneeId).toBe("usr_rec1");
    expect(row.createdById).toBe("usr_rec1");
    expect(row.isPersonal).toBe(true);
    expect(notifyMock).not.toHaveBeenCalled();

    const log = await db.activityLog.findFirstOrThrow({ where: { entityType: "CalendarTask", entityId: id } });
    expect(log.action).toBe("created");
    expect(JSON.stringify(log)).not.toContain(MARK);
  });

  it("другому: исполнитель получает уведомление «поставили задачу» (VK идёт по каналам события)", async () => {
    const { id } = await createTask(head, { title: `${MARK}рекрутёру`, startsAt: future(5), assigneeId: rec1.id });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].event).toBe("TASK_ASSIGNED");
    expect(calls()[0].userIds).toEqual(["usr_rec1"]);
    expect(calls()[0].title).toContain(`${MARK}рекрутёру`);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).isPersonal).toBe(false);

    const { EVENTS } = await import("@/lib/notifications/events");
    expect(EVENTS.TASK_ASSIGNED.channels).toContain("vk");
    expect(EVENTS.TASK_REMINDER.channels).toContain("vk");
  });

  it("рекрутёр и менеджер не могут назначить другому; клиент задач не создаёт", async () => {
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), assigneeId: rec2.id })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), assigneeId: head.id })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(account, { title: `${MARK}x`, startsAt: future(1), assigneeId: rec1.id })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(client, { title: `${MARK}x`, startsAt: future(1) })).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await db.calendarTask.count({ where: { title: { startsWith: MARK } } })).toBe(0);
  });

  it("пустое название, кривая дата, длительность и правило повторения отклоняются", async () => {
    await expect(createTask(rec1, { title: "   ", startsAt: future(1) })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: new Date("нет") })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: "я".repeat(201), startsAt: future(1) })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), durationMinutes: 1 })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), recurrenceRule: "HOURLY" })).rejects.toBeInstanceOf(TaskError);
    await expect(
      createTask(rec1, { title: `${MARK}x`, startsAt: future(1), recurrenceRule: "DAILY", recurrenceUntil: future(-48) }),
    ).rejects.toBeInstanceOf(TaskError);
  });

  it("исполнитель из чужой организации или клиентский пользователь не принимается", async () => {
    await expect(createTask(owner, { title: `${MARK}x`, startsAt: future(1), assigneeId: "usr_cl_admin" })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(owner, { title: `${MARK}x`, startsAt: future(1), assigneeId: "нет-такого" })).rejects.toBeInstanceOf(TaskError);
  });

  it("срок прошёл или напоминание уже в окне: «просрочено» и «напоминание» сразу не шлём", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}позавчера`, startsAt: future(-48), hasDeadline: true });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.overdueNotifiedAt).not.toBeNull();
    expect(row.reminderSentAt).not.toBeNull();

    // Напоминание за час, а до начала 20 минут: окно уже открыто
    const soon = await createTask(rec1, { title: `${MARK}скоро`, startsAt: new Date(Date.now() + 20 * 60_000), hasDeadline: true });
    const soonRow = await db.calendarTask.findUniqueOrThrow({ where: { id: soon.id } });
    expect(soonRow.reminderSentAt).not.toBeNull();
    expect(soonRow.overdueNotifiedAt).toBeNull();

    // Через сутки: ждёт своего окна
    const later = await createTask(rec1, { title: `${MARK}завтра`, startsAt: future(24), hasDeadline: true });
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id: later.id } })).reminderSentAt).toBeNull();
  });

  it("задача без дедлайна: без напоминания и просрочки", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}без срока`, startsAt: future(-5), hasDeadline: false });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.remindBeforeMinutes).toBeNull();
    const rows = await listTasks(rec1, { from: future(-10), to: future(0) });
    expect(rows.find((r) => r.id === id)?.overdue).toBe(false);
  });

  it("несуществующая вакансия и кандидат отклоняются", async () => {
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), vacancyId: "нет" })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, startsAt: future(1), candidateId: "нет" })).rejects.toBeInstanceOf(TaskError);
  });
});

describe("кто что видит", () => {
  const range = { from: future(0), to: future(24) };
  const visible = async (actor: Actor, ids: string[]) =>
    (await listTasks(actor, range)).map((t) => t.id).filter((id) => ids.includes(id)).sort();

  it("личная не видна даже владельцу и руководителю; назначенная видна автору, исполнителю, OWNER и HEAD", async () => {
    const personalRec = await createTask(rec1, { title: `${MARK}личная рекрутёра`, startsAt: future(2) });
    const personalOwner = await createTask(owner, { title: `${MARK}личная владельца`, startsAt: future(2) });
    const personalHead = await createTask(head, { title: `${MARK}личная руководителя`, startsAt: future(2) });
    const assigned = await createTask(head, { title: `${MARK}назначена`, startsAt: future(2), assigneeId: rec1.id });
    const ids = [personalRec.id, personalOwner.id, personalHead.id, assigned.id];

    expect(await visible(rec1, ids)).toEqual([personalRec.id, assigned.id].sort());
    expect(await visible(rec2, ids)).toEqual([]);
    expect(await visible(account, ids)).toEqual([]);
    // Автор назначенной видит её и свою личную, чужие личные нет
    expect(await visible(head, ids)).toEqual([personalHead.id, assigned.id].sort());
    expect(await visible(owner, ids)).toEqual([personalOwner.id, assigned.id].sort());
    await expect(listTasks(client, range)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("задача, назначенная владельцем руководителю, видна обоим; рекрутёру нет", async () => {
    const t = await createTask(owner, { title: `${MARK}от владельца`, startsAt: future(2), assigneeId: head.id });
    expect(await visible(owner, [t.id])).toEqual([t.id]);
    expect(await visible(head, [t.id])).toEqual([t.id]);
    expect(await visible(rec1, [t.id])).toEqual([]);
  });

  it("чужую личную задачу нельзя ни изменить, ни отметить, ни удалить: «не найдена»", async () => {
    const mine = await createTask(rec1, { title: `${MARK}личное дело`, startsAt: future(5) });
    for (const stranger of [owner, head, rec2]) {
      await expect(updateTask(stranger, mine.id, { title: `${MARK}взлом`, startsAt: future(5) })).rejects.toThrow("Задача не найдена");
      await expect(setTaskDone(stranger, mine.id, true)).rejects.toThrow("Задача не найдена");
      await expect(deleteTask(stranger, mine.id)).rejects.toThrow("Задача не найдена");
    }
    expect(await db.calendarTask.count({ where: { id: mine.id } })).toBe(1);
  });

  it("задачи другой организации не видны", async () => {
    await createTask(rec1, { title: `${MARK}орг`, startsAt: future(2) });
    const outsider = { ...rec1, organizationId: "org_other" };
    expect((await listTasks(outsider, range)).filter((t) => t.title.startsWith(MARK))).toEqual([]);
  });

  it("просроченное невыполненное с дедлайном показывается отдельным списком, выполненное и без дедлайна нет", async () => {
    const stale = await createTask(rec1, { title: `${MARK}старое открытое`, startsAt: future(-72), hasDeadline: true });
    const noDeadline = await createTask(rec1, { title: `${MARK}старое без срока`, startsAt: future(-72), hasDeadline: false });
    const oldDone = await createTask(rec1, { title: `${MARK}старое готовое`, startsAt: future(-72), hasDeadline: true });
    await setTaskDone(rec1, oldDone.id, true);

    const overdue = (await listOverdueTasks(rec1, { before: new Date() })).map((r) => r.id);
    expect(overdue).toContain(stale.id);
    expect(overdue).not.toContain(noDeadline.id);
    expect(overdue).not.toContain(oldDone.id);
    // Чужой личной в списке просрочек нет
    expect((await listOverdueTasks(owner, { before: new Date() })).map((r) => r.id)).not.toContain(stale.id);
  });

  it("в строке видны имена, права и признак просрочки", async () => {
    const { id } = await createTask(head, { title: `${MARK}с правами`, startsAt: future(2), assigneeId: rec1.id, hasDeadline: true });
    const forRec = (await listTasks(rec1, range)).find((t) => t.id === id)!;
    expect(forRec.assignee.fullName).toBeTruthy();
    expect(forRec.createdBy.id).toBe("usr_head");
    expect(forRec.canEdit).toBe(false);
    expect(forRec.canComplete).toBe(true);
    expect(forRec.personal).toBe(false);
    const forHead = (await listTasks(head, range)).find((t) => t.id === id)!;
    expect(forHead.canEdit).toBe(true);
  });

  it("ближайший дедлайн: первая невыполненная задача с дедлайном", async () => {
    const a = await createTask(rec1, { title: `${MARK}позже`, startsAt: future(10), hasDeadline: true });
    const b = await createTask(rec1, { title: `${MARK}раньше`, startsAt: future(5), hasDeadline: true });
    await createTask(rec1, { title: `${MARK}не дедлайн`, startsAt: future(1), hasDeadline: false });
    const list = (await upcomingDeadlines(rec1, new Date())).filter((r) => r.title.startsWith(MARK));
    expect(list.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});

describe("изменение, выполнение, удаление", () => {
  it("постановщик меняет время: исполнитель получает «изменено»", async () => {
    const { id } = await createTask(head, { title: `${MARK}меняем`, startsAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await updateTask(head, id, { title: `${MARK}меняем`, startsAt: future(8), assigneeId: rec1.id });
    expect(calls().map((c) => c.event)).toEqual(["TASK_CHANGED"]);
    expect(calls()[0].userIds).toEqual(["usr_rec1"]);
  });

  it("смена исполнителя: прежнему «передано другому», новому «поставили»", async () => {
    const { id } = await createTask(head, { title: `${MARK}передаём`, startsAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await updateTask(head, id, { title: `${MARK}передаём`, startsAt: future(5), assigneeId: rec2.id });
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([
      ["TASK_CANCELLED", "usr_rec1"],
      ["TASK_ASSIGNED", "usr_rec2"],
    ]);
  });

  it("постановщик не может сделать исполнителем того, кого ему нельзя; рекрутёр свою задачу другому не отдаст", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}свою не отдам`, startsAt: future(5) });
    await expect(updateTask(rec1, id, { title: `${MARK}свою не отдам`, startsAt: future(5), assigneeId: rec2.id })).rejects.toBeInstanceOf(TaskError);
  });

  it("при переносе времени флаги напоминаний сбрасываются заново", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}перенос`, startsAt: future(-2), hasDeadline: true });
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).overdueNotifiedAt).not.toBeNull();
    await updateTask(rec1, id, { title: `${MARK}перенос`, startsAt: future(30), hasDeadline: true });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.overdueNotifiedAt).toBeNull();
    expect(row.reminderSentAt).toBeNull();
  });

  it("исполнитель задачу не правит, владелец может", async () => {
    const { id } = await createTask(head, { title: `${MARK}чужое`, startsAt: future(5), assigneeId: rec1.id });
    await expect(updateTask(rec1, id, { title: `${MARK}чужое!`, startsAt: future(5) })).rejects.toBeInstanceOf(TaskError);
    await expect(updateTask(owner, id, { title: `${MARK}чужое`, startsAt: future(6), assigneeId: rec1.id })).resolves.toEqual({ id });
  });

  it("исполнитель отмечает выполненной: постановщик получает уведомление; сам себе нет", async () => {
    const { id } = await createTask(head, { title: `${MARK}делаем`, startsAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await setTaskDone(rec1, id, true);
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([["TASK_COMPLETED", "usr_head"]]);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).completedAt).not.toBeNull();

    notifyMock.mockClear();
    await setTaskDone(rec1, id, false);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).completedAt).toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();

    const mine = await createTask(rec1, { title: `${MARK}себе готово`, startsAt: future(5) });
    notifyMock.mockClear();
    await setTaskDone(rec1, mine.id, true);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("посторонний отметить не может", async () => {
    const { id } = await createTask(head, { title: `${MARK}чужое дело`, startsAt: future(5), assigneeId: rec1.id });
    await expect(setTaskDone(rec2, id, true)).rejects.toBeInstanceOf(TaskError);
    await expect(setTaskDone(account, id, true)).rejects.toBeInstanceOf(TaskError);
    await expect(setTaskDone(client, id, true)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("удаляет постановщик или владелец; исполнитель узнаёт об отмене", async () => {
    const { id } = await createTask(head, { title: `${MARK}отмена`, startsAt: future(5), assigneeId: rec1.id });
    await expect(deleteTask(rec1, id)).rejects.toBeInstanceOf(TaskError);
    notifyMock.mockClear();
    await deleteTask(head, id);
    expect(await db.calendarTask.count({ where: { id } })).toBe(0);
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([["TASK_CANCELLED", "usr_rec1"]]);

    // Руководитель чужую задачу рекрутёра, назначенную другим, не удаляет
    const byOwner = await createTask(owner, { title: `${MARK}от владельца`, startsAt: future(5), assigneeId: rec1.id });
    await expect(deleteTask(head, byOwner.id)).rejects.toBeInstanceOf(TaskError);
    await expect(deleteTask(owner, byOwner.id)).resolves.toBeUndefined();
  });

  it("несуществующая задача и чужая организация", async () => {
    await expect(setTaskDone(rec1, "нет", true)).rejects.toBeInstanceOf(TaskError);
    const { id } = await createTask(rec1, { title: `${MARK}орг`, startsAt: future(5) });
    await expect(deleteTask({ ...rec1, organizationId: "org_other" }, id)).rejects.toBeInstanceOf(TaskError);
  });
});

describe("повторяющиеся задачи", () => {
  const week = { from: MON, to: new Date(MON.getTime() + 7 * DAY) };
  const starts = async (actor: Actor, range = week) =>
    (await listTasks(actor, range)).filter((t) => t.title.startsWith(MARK)).map((t) => t.startsAt.toISOString());

  it("каждый день: вхождения разворачиваются только в запрошенном диапазоне", async () => {
    await createTask(rec1, { title: `${MARK}ежедневно`, startsAt: MON, recurrenceRule: "DAILY" });
    expect(await starts(rec1)).toHaveLength(7);
    const three = await starts(rec1, { from: new Date(MON.getTime() + 2 * DAY), to: new Date(MON.getTime() + 5 * DAY) });
    expect(three).toHaveLength(3);
    // До начала серии вхождений нет
    expect(await starts(rec1, { from: new Date(MON.getTime() - 7 * DAY), to: MON })).toEqual([]);
    // Время суток у всех то же
    expect(new Set(three.map((s) => s.slice(11)))).toEqual(new Set(["07:00:00.000Z"]));
  });

  it("каждую неделю по пн, ср, пт и до даты", async () => {
    const until = new Date(MON.getTime() + 9 * DAY); // среда следующей недели
    await createTask(rec1, {
      title: `${MARK}по дням`,
      startsAt: MON,
      recurrenceRule: "WEEKLY:FR,MO,WE",
      recurrenceUntil: until,
    });
    const rows = await starts(rec1, { from: MON, to: new Date(MON.getTime() + 21 * DAY) });
    // Первая неделя: пн ср пт; вторая: пн ср (до среды включительно)
    expect(rows).toHaveLength(5);
    const stored = await db.calendarTask.findFirstOrThrow({ where: { title: `${MARK}по дням` } });
    expect(stored.recurrenceRule).toBe("WEEKLY:MO,WE,FR");
    await expect(createTask(rec1, { title: `${MARK}пусто`, startsAt: MON, recurrenceRule: "WEEKLY:" })).rejects.toBeInstanceOf(TaskError);
  });

  it("каждый месяц: тот же день месяца, 31-го в коротком месяце вхождения нет", async () => {
    await createTask(rec1, { title: `${MARK}месяц`, startsAt: new Date("2030-01-31T07:00:00Z"), recurrenceRule: "MONTHLY" });
    const rows = await starts(rec1, { from: new Date("2030-01-01T00:00:00Z"), to: new Date("2030-05-01T00:00:00Z") });
    expect(rows.map((r) => r.slice(0, 10))).toEqual(["2030-01-31", "2030-03-31"]);
  });

  it("только это: отмена вхождения не трогает остальные", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}отмена одного`, startsAt: MON, recurrenceRule: "DAILY" });
    const wed = new Date(MON.getTime() + 2 * DAY);
    await deleteTask(rec1, id, { scope: "this", occurrence: wed });
    const rows = await starts(rec1);
    expect(rows).toHaveLength(6);
    expect(rows).not.toContain(wed.toISOString());
    expect(await db.calendarTask.count({ where: { id } })).toBe(1);
    expect(await db.calendarTaskException.count({ where: { taskId: id, cancelled: true } })).toBe(1);
  });

  it("только это: перенос времени одного вхождения без новой задачи", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}перенос одного`, startsAt: MON, recurrenceRule: "DAILY" });
    const tue = new Date(MON.getTime() + DAY);
    const moved = new Date(tue.getTime() + 4 * H);
    const result = await updateTask(rec1, id, { title: `${MARK}перенос одного`, startsAt: moved, recurrenceRule: "DAILY" }, { scope: "this", occurrence: tue });
    expect(result.id).toBe(id);
    const rows = await starts(rec1);
    expect(rows).toHaveLength(7);
    expect(rows).toContain(moved.toISOString());
    expect(rows).not.toContain(tue.toISOString());
    expect(await db.calendarTask.count({ where: { title: { startsWith: MARK } } })).toBe(1);
  });

  it("только это: правка названия отменяет вхождение и создаёт отдельную задачу", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}серия`, startsAt: MON, recurrenceRule: "DAILY" });
    const tue = new Date(MON.getTime() + DAY);
    const result = await updateTask(rec1, id, { title: `${MARK}серия особая`, startsAt: tue }, { scope: "this", occurrence: tue });
    expect(result.id).not.toBe(id);
    const created = await db.calendarTask.findUniqueOrThrow({ where: { id: result.id } });
    expect(created.recurrenceRule).toBeNull();
    const rows = (await listTasks(rec1, week)).filter((t) => t.title.startsWith(MARK));
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.title.endsWith("особая"))).toHaveLength(1);
  });

  it("это и следующие: серия обрывается накануне, новая начинается с правки", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}делим`, startsAt: MON, recurrenceRule: "DAILY" });
    const thu = new Date(MON.getTime() + 3 * DAY);
    const next = await updateTask(
      rec1,
      id,
      { title: `${MARK}делим новое`, startsAt: new Date(thu.getTime() + H), recurrenceRule: "DAILY" },
      { scope: "following", occurrence: thu },
    );
    expect(next.id).not.toBe(id);
    const rows = (await listTasks(rec1, week)).filter((t) => t.title.startsWith(MARK));
    expect(rows.filter((r) => r.title === `${MARK}делим`)).toHaveLength(3); // пн вт ср
    expect(rows.filter((r) => r.title === `${MARK}делим новое`)).toHaveLength(4); // чт пт сб вс
    expect(rows.filter((r) => r.title === `${MARK}делим новое`)[0].startsAt.toISOString()).toBe(new Date(thu.getTime() + H).toISOString());
  });

  it("все: правка сдвигает серию, удаление убирает её целиком", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}вся`, startsAt: MON, recurrenceRule: "DAILY" });
    const tue = new Date(MON.getTime() + DAY);
    await updateTask(rec1, id, { title: `${MARK}вся`, startsAt: new Date(tue.getTime() + 2 * H), recurrenceRule: "DAILY" }, { scope: "all", occurrence: tue });
    const rows = await starts(rec1);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toBe(new Date(MON.getTime() + 2 * H).toISOString());

    await deleteTask(rec1, id, { scope: "all" });
    expect(await starts(rec1)).toEqual([]);
  });

  it("удаление «это и следующие» заканчивает серию накануне", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}обрезаем`, startsAt: MON, recurrenceRule: "DAILY" });
    await deleteTask(rec1, id, { scope: "following", occurrence: new Date(MON.getTime() + 3 * DAY) });
    expect(await starts(rec1)).toHaveLength(3);
  });

  it("отметка «сделано» относится к одному вхождению", async () => {
    const { id } = await createTask(head, { title: `${MARK}отметка`, startsAt: MON, recurrenceRule: "DAILY", assigneeId: rec1.id });
    const tue = new Date(MON.getTime() + DAY);
    await setTaskDone(rec1, id, true, { occurrence: tue });
    const rows = (await listTasks(rec1, week)).filter((t) => t.title.startsWith(MARK));
    expect(rows.filter((r) => r.completedAt)).toHaveLength(1);
    expect(rows.find((r) => r.completedAt)?.startsAt.toISOString()).toBe(tue.toISOString());
    await expect(setTaskDone(rec1, id, true)).rejects.toBeInstanceOf(TaskError);
    await expect(setTaskDone(rec1, id, true, { occurrence: new Date(MON.getTime() + 5 * H) })).rejects.toBeInstanceOf(TaskError);
  });

  it("видимость серии та же: чужая личная не раскрывается", async () => {
    await createTask(rec1, { title: `${MARK}личная серия`, startsAt: MON, recurrenceRule: "DAILY" });
    expect(await starts(owner)).toEqual([]);
    expect(await starts(head)).toEqual([]);
  });
});

describe("рассылка по времени", () => {
  async function task(data: {
    title: string;
    dueAt: Date;
    completedAt?: Date;
    assigneeId?: string;
    createdById?: string;
    remindBeforeMinutes?: number | null;
    hasDeadline?: boolean;
    recurrenceRule?: string;
    reminderSentAt?: Date;
  }) {
    const assigneeId = data.assigneeId ?? "usr_rec1";
    const createdById = data.createdById ?? "usr_head";
    return db.calendarTask.create({
      data: {
        organizationId: ORG,
        hasDeadline: true,
        isPersonal: assigneeId === createdById,
        assigneeId,
        createdById,
        ...data,
      },
    });
  }
  const ours = (event: string) => calls().filter((c) => c.event === event && c.title.includes(MARK));

  it("напоминание за remindBeforeMinutes: один раз и только по нужным задачам", async () => {
    const due = await task({ title: `${MARK}через 40 минут`, dueAt: new Date(Date.now() + 40 * 60_000), remindBeforeMinutes: 60 });
    await task({ title: `${MARK}через 3 часа`, dueAt: new Date(Date.now() + 3 * H), remindBeforeMinutes: 60 });
    await task({ title: `${MARK}уже готово`, dueAt: new Date(Date.now() + 40 * 60_000), completedAt: new Date() });
    await task({ title: `${MARK}без напоминания`, dueAt: new Date(Date.now() + 40 * 60_000), remindBeforeMinutes: null });
    await task({ title: `${MARK}без дедлайна`, dueAt: new Date(Date.now() + 40 * 60_000), hasDeadline: false });
    await task({ title: `${MARK}за 5 минут, рано`, dueAt: new Date(Date.now() + 40 * 60_000), remindBeforeMinutes: 5 });

    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(1);
    expect(ours("TASK_REMINDER")[0].userIds).toEqual(["usr_rec1"]);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).not.toBeNull();

    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(1);
  });

  it("повторяющаяся: напоминание перед каждым вхождением, не дважды перед одним", async () => {
    // Серия началась неделю назад в то же время суток; ближайшее вхождение через 30 минут
    const nextStart = Date.now() + 30 * 60_000;
    const t = await task({
      title: `${MARK}серия с напоминанием`,
      dueAt: new Date(nextStart - 7 * DAY),
      recurrenceRule: "DAILY",
      remindBeforeMinutes: 60,
    });
    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(1);
    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(1);

    // Прошли сутки: окно следующего вхождения открылось заново
    await db.calendarTask.update({ where: { id: t.id }, data: { reminderSentAt: new Date(Date.now() - DAY) } });
    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(2);
  });

  it("повторяющаяся: отменённое вхождение не напоминает", async () => {
    const nextStart = new Date(Date.now() + 30 * 60_000);
    const t = await task({
      title: `${MARK}серия отменена`,
      dueAt: new Date(nextStart.getTime() - 7 * DAY),
      recurrenceRule: "DAILY",
      remindBeforeMinutes: 60,
    });
    await db.calendarTaskException.create({ data: { taskId: t.id, occurrenceDate: nextStart, cancelled: true } });
    await sendTaskReminders();
    expect(ours("TASK_REMINDER")).toHaveLength(0);
  });

  it("просрочено: сообщают исполнителю и постановщику один раз; без дедлайна и повторяющиеся не трогаем", async () => {
    await task({ title: `${MARK}опоздали`, dueAt: new Date(Date.now() - 2 * H) });
    await task({ title: `${MARK}опоздали и сделали`, dueAt: new Date(Date.now() - 2 * H), completedAt: new Date() });
    await task({ title: `${MARK}без дедлайна`, dueAt: new Date(Date.now() - 2 * H), hasDeadline: false });
    await task({ title: `${MARK}серия`, dueAt: new Date(Date.now() - 2 * H), recurrenceRule: "DAILY" });

    await notifyOverdueTasks();
    expect(ours("TASK_OVERDUE")).toHaveLength(1);
    expect(ours("TASK_OVERDUE")[0].userIds.sort()).toEqual(["usr_head", "usr_rec1"]);

    await notifyOverdueTasks();
    expect(ours("TASK_OVERDUE")).toHaveLength(1);
  });

  it("когда исполнитель и постановщик один человек, сообщение одно", async () => {
    await task({ title: `${MARK}сам себе`, dueAt: new Date(Date.now() - H), createdById: "usr_rec1" });
    await notifyOverdueTasks();
    const mine = ours("TASK_OVERDUE").filter((c) => c.title.includes("сам себе"));
    expect(mine[0].userIds).toEqual(["usr_rec1"]);
  });
});
