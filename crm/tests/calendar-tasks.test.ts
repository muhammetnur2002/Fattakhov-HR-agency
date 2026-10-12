/**
 * Задания в календаре: кто кому ставит, кто что видит и меняет, уведомления на
 * каждое событие и рассылка по времени (за 15 минут, просрочка).
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
  createTask,
  deleteTask,
  listAssignableUsers,
  listTasks,
  seesAllTasks,
  setTaskDone,
  TaskError,
  taskPermissions,
  updateTask,
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
  it("кто кому может поставить задание", () => {
    // владелец: любому
    expect(canAssignTaskTo(owner, head)).toBe(true);
    expect(canAssignTaskTo(owner, rec1)).toBe(true);
    // руководитель и менеджер: рекрутёрам и себе
    expect(canAssignTaskTo(head, rec1)).toBe(true);
    expect(canAssignTaskTo(account, rec1)).toBe(true);
    expect(canAssignTaskTo(head, head)).toBe(true);
    expect(canAssignTaskTo(head, owner)).toBe(false);
    expect(canAssignTaskTo(head, account)).toBe(false);
    expect(canAssignTaskTo(account, head)).toBe(false);
    // рекрутёр: только себе
    expect(canAssignTaskTo(rec1, rec1)).toBe(true);
    expect(canAssignTaskTo(rec1, rec2)).toBe(false);
    expect(canAssignTaskTo(rec1, head)).toBe(false);
  });

  it("все задания видят владелец и руководитель; менять может постановщик и владелец", () => {
    expect(seesAllTasks(owner)).toBe(true);
    expect(seesAllTasks(head)).toBe(true);
    expect(seesAllTasks(account)).toBe(false);
    expect(seesAllTasks(rec1)).toBe(false);

    const task = { createdById: head.id, assigneeId: rec1.id };
    expect(taskPermissions(head, task)).toEqual({ edit: true, complete: true });
    expect(taskPermissions(rec1, task)).toEqual({ edit: false, complete: true });
    expect(taskPermissions(owner, task)).toEqual({ edit: true, complete: true });
    expect(taskPermissions(rec2, task)).toEqual({ edit: false, complete: false });
    // руководитель чужое задание не правит: только видит
    expect(taskPermissions(head, { createdById: owner.id, assigneeId: owner.id })).toEqual({ edit: false, complete: false });
  });

  it("список тех, кому можно поставить: рекрутёру только он сам, руководителю рекрутёры и он", async () => {
    expect((await listAssignableUsers(rec1)).map((u) => u.id)).toEqual(["usr_rec1"]);

    const forHead = await listAssignableUsers(head);
    expect(forHead[0].id).toBe("usr_head");
    expect(forHead.every((u) => u.id === "usr_head" || u.role === "RECRUITER")).toBe(true);

    const forOwner = await listAssignableUsers(owner);
    expect(forOwner.map((u) => u.id)).toEqual(expect.arrayContaining(["usr_owner", "usr_head", "usr_account", "usr_rec1"]));
    expect(forOwner.every((u) => u.role !== "CLIENT_ADMIN")).toBe(true);

    await expect(listAssignableUsers(client)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("постановка задания", () => {
  it("себе: уведомления нет", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}себе`, dueAt: future(3) });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.assigneeId).toBe("usr_rec1");
    expect(row.createdById).toBe("usr_rec1");
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("коллеге: исполнитель получает уведомление «поставили задание»", async () => {
    await createTask(head, { title: `${MARK}рекрутёру`, dueAt: future(5), assigneeId: rec1.id });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].event).toBe("TASK_ASSIGNED");
    expect(calls()[0].userIds).toEqual(["usr_rec1"]);
    expect(calls()[0].title).toContain(`${MARK}рекрутёру`);
  });

  it("чужому по запрещённой роли, клиенту, пустое название и кривая дата отклоняются", async () => {
    await expect(createTask(rec1, { title: `${MARK}x`, dueAt: future(1), assigneeId: rec2.id })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(head, { title: `${MARK}x`, dueAt: future(1), assigneeId: owner.id })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(client, { title: `${MARK}x`, dueAt: future(1) })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(createTask(rec1, { title: "   ", dueAt: future(1) })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, dueAt: new Date("нет") })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: "я".repeat(201), dueAt: future(1) })).rejects.toBeInstanceOf(TaskError);
  });

  it("исполнитель из чужой организации или клиентский пользователь не принимается", async () => {
    await expect(
      createTask(owner, { title: `${MARK}x`, dueAt: future(1), assigneeId: "usr_cl_admin" }),
    ).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(owner, { title: `${MARK}x`, dueAt: future(1), assigneeId: "нет-такого" })).rejects.toBeInstanceOf(TaskError);
  });

  it("задание со сроком, который уже прошёл или близко, не шлёт «просрочено» и «за 15 минут» сразу", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}позавчера`, dueAt: future(-48) });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.overdueNotifiedAt).not.toBeNull();
    expect(row.reminderSentAt).not.toBeNull();

    const soon = await createTask(rec1, { title: `${MARK}скоро`, dueAt: new Date(Date.now() + 5 * 60_000) });
    const soonRow = await db.calendarTask.findUniqueOrThrow({ where: { id: soon.id } });
    expect(soonRow.reminderSentAt).not.toBeNull();
    expect(soonRow.overdueNotifiedAt).toBeNull();
  });

  it("несуществующая вакансия и кандидат отклоняются", async () => {
    await expect(createTask(rec1, { title: `${MARK}x`, dueAt: future(1), vacancyId: "нет" })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(rec1, { title: `${MARK}x`, dueAt: future(1), candidateId: "нет" })).rejects.toBeInstanceOf(TaskError);
  });
});

describe("кто что видит", () => {
  it("рекрутёр: свои и поставленные им; руководитель и владелец: все; менеджер: свои и поставленные", async () => {
    const mine = await createTask(rec1, { title: `${MARK}рекрутёр1 себе`, dueAt: future(2) });
    const other = await createTask(rec2, { title: `${MARK}рекрутёр2 себе`, dueAt: future(2) });
    const fromAccount = await createTask(account, { title: `${MARK}менеджер рекрутёру1`, dueAt: future(2), assigneeId: rec1.id });

    const range = { from: future(0), to: future(24) };
    const ids = async (a: Actor) => (await listTasks(a, range)).map((t) => t.id).filter((id) => [mine.id, other.id, fromAccount.id].includes(id));

    expect((await ids(rec1)).sort()).toEqual([mine.id, fromAccount.id].sort());
    expect((await ids(rec2)).sort()).toEqual([other.id]);
    expect((await ids(head)).sort()).toEqual([mine.id, other.id, fromAccount.id].sort());
    expect((await ids(owner)).sort()).toEqual([mine.id, other.id, fromAccount.id].sort());
    expect((await ids(account)).sort()).toEqual([fromAccount.id]);
    await expect(listTasks(client, range)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("просроченное невыполненное показывается всегда, выполненное старое нет", async () => {
    const stale = await db.calendarTask.create({
      data: { organizationId: ORG, title: `${MARK}старое открытое`, dueAt: future(-72), assigneeId: rec1.id, createdById: rec1.id },
    });
    const oldDone = await db.calendarTask.create({
      data: {
        organizationId: ORG,
        title: `${MARK}старое готовое`,
        dueAt: future(-72),
        assigneeId: rec1.id,
        createdById: rec1.id,
        completedAt: future(-70),
      },
    });
    const rows = await listTasks(rec1, { from: future(24), to: future(48) });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(stale.id);
    expect(ids).not.toContain(oldDone.id);
    expect(rows.find((r) => r.id === stale.id)?.overdue).toBe(true);
  });

  it("в строке видны имена, права и признак просрочки", async () => {
    const { id } = await createTask(head, { title: `${MARK}с правами`, dueAt: future(2), assigneeId: rec1.id });
    const forRec = (await listTasks(rec1, { from: future(0), to: future(24) })).find((t) => t.id === id)!;
    expect(forRec.assignee.fullName).toBeTruthy();
    expect(forRec.createdBy.id).toBe("usr_head");
    expect(forRec.canEdit).toBe(false);
    expect(forRec.canComplete).toBe(true);
    const forHead = (await listTasks(head, { from: future(0), to: future(24) })).find((t) => t.id === id)!;
    expect(forHead.canEdit).toBe(true);
  });
});

describe("изменение, выполнение, удаление", () => {
  it("постановщик меняет срок: исполнитель получает «изменено»", async () => {
    const { id } = await createTask(head, { title: `${MARK}меняем`, dueAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await updateTask(head, id, { title: `${MARK}меняем`, dueAt: future(8), assigneeId: rec1.id });
    expect(calls().map((c) => c.event)).toEqual(["TASK_CHANGED"]);
    expect(calls()[0].userIds).toEqual(["usr_rec1"]);
  });

  it("смена исполнителя: прежнему «передано другому», новому «поставили»", async () => {
    const { id } = await createTask(head, { title: `${MARK}передаём`, dueAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await updateTask(head, id, { title: `${MARK}передаём`, dueAt: future(5), assigneeId: rec2.id });
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([
      ["TASK_CANCELLED", "usr_rec1"],
      ["TASK_ASSIGNED", "usr_rec2"],
    ]);
  });

  it("при переносе срока флаги напоминаний сбрасываются заново", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}перенос`, dueAt: future(-2) });
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).overdueNotifiedAt).not.toBeNull();
    await updateTask(rec1, id, { title: `${MARK}перенос`, dueAt: future(10) });
    const row = await db.calendarTask.findUniqueOrThrow({ where: { id } });
    expect(row.overdueNotifiedAt).toBeNull();
    expect(row.reminderSentAt).toBeNull();
  });

  it("исполнитель задание не правит, владелец может", async () => {
    const { id } = await createTask(head, { title: `${MARK}чужое`, dueAt: future(5), assigneeId: rec1.id });
    await expect(updateTask(rec1, id, { title: `${MARK}чужое!`, dueAt: future(5) })).rejects.toBeInstanceOf(TaskError);
    await expect(updateTask(owner, id, { title: `${MARK}чужое`, dueAt: future(6), assigneeId: rec1.id })).resolves.toBeUndefined();
  });

  it("исполнитель отмечает выполненным: постановщик получает уведомление; сам себе нет", async () => {
    const { id } = await createTask(head, { title: `${MARK}делаем`, dueAt: future(5), assigneeId: rec1.id });
    notifyMock.mockClear();
    await setTaskDone(rec1, id, true);
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([["TASK_COMPLETED", "usr_head"]]);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).completedAt).not.toBeNull();

    notifyMock.mockClear();
    await setTaskDone(rec1, id, false);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id } })).completedAt).toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();

    const mine = await createTask(rec1, { title: `${MARK}себе готово`, dueAt: future(5) });
    notifyMock.mockClear();
    await setTaskDone(rec1, mine.id, true);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("посторонний отметить не может", async () => {
    const { id } = await createTask(rec1, { title: `${MARK}чужое дело`, dueAt: future(5) });
    await expect(setTaskDone(rec2, id, true)).rejects.toBeInstanceOf(TaskError);
    await expect(setTaskDone(client, id, true)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("удаляет постановщик или владелец; исполнитель узнаёт об отмене", async () => {
    const { id } = await createTask(head, { title: `${MARK}отмена`, dueAt: future(5), assigneeId: rec1.id });
    await expect(deleteTask(rec1, id)).rejects.toBeInstanceOf(TaskError);
    notifyMock.mockClear();
    await deleteTask(head, id);
    expect(await db.calendarTask.count({ where: { id } })).toBe(0);
    expect(calls().map((c) => [c.event, c.userIds[0]])).toEqual([["TASK_CANCELLED", "usr_rec1"]]);

    const other = await createTask(rec1, { title: `${MARK}не руководителю`, dueAt: future(5) });
    await expect(deleteTask(head, other.id)).rejects.toBeInstanceOf(TaskError);
    await expect(deleteTask(owner, other.id)).resolves.toBeUndefined();
  });

  it("несуществующее задание и чужая организация", async () => {
    await expect(setTaskDone(rec1, "нет", true)).rejects.toBeInstanceOf(TaskError);
    const { id } = await createTask(rec1, { title: `${MARK}орг`, dueAt: future(5) });
    await expect(deleteTask({ ...rec1, organizationId: "org_other" }, id)).rejects.toBeInstanceOf(TaskError);
  });
});

describe("рассылка по времени", () => {
  async function task(data: { title: string; dueAt: Date; completedAt?: Date; assigneeId?: string; createdById?: string }) {
    return db.calendarTask.create({
      data: { organizationId: ORG, assigneeId: "usr_rec1", createdById: "usr_head", ...data },
    });
  }

  it("за 15 минут: напоминание уходит один раз и только по нужным заданиям", async () => {
    const due = await task({ title: `${MARK}через 10 минут`, dueAt: new Date(Date.now() + 10 * 60_000) });
    await task({ title: `${MARK}через 40 минут`, dueAt: new Date(Date.now() + 40 * 60_000) });
    await task({ title: `${MARK}уже готово`, dueAt: new Date(Date.now() + 10 * 60_000), completedAt: new Date() });

    const ours = () => calls().filter((c) => c.event === "TASK_REMINDER" && c.title.includes(MARK));
    await sendTaskReminders();
    expect(ours()).toHaveLength(1);
    expect(ours()[0].userIds).toEqual(["usr_rec1"]);
    expect((await db.calendarTask.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).not.toBeNull();

    await sendTaskReminders();
    expect(ours()).toHaveLength(1);
  });

  it("просрочено: сообщают исполнителю и постановщику один раз", async () => {
    await task({ title: `${MARK}опоздали`, dueAt: new Date(Date.now() - 2 * H) });
    await task({ title: `${MARK}опоздали и сделали`, dueAt: new Date(Date.now() - 2 * H), completedAt: new Date() });

    const ours = () => calls().filter((c) => c.event === "TASK_OVERDUE" && c.title.includes(MARK));
    await notifyOverdueTasks();
    expect(ours()).toHaveLength(1);
    expect(ours()[0].userIds.sort()).toEqual(["usr_head", "usr_rec1"]);

    await notifyOverdueTasks();
    expect(ours()).toHaveLength(1);
  });

  it("когда исполнитель и постановщик один человек, сообщение одно", async () => {
    await task({ title: `${MARK}сам себе`, dueAt: new Date(Date.now() - H), createdById: "usr_rec1" });
    await notifyOverdueTasks();
    const mine = calls().filter((c) => c.event === "TASK_OVERDUE" && c.title.includes(`${MARK}сам себе`));
    expect(mine[0].userIds).toEqual(["usr_rec1"]);
  });
});
