"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { searchCandidates } from "@/lib/services/candidates";
import { createTask, deleteTask, setTaskDone, TaskError, updateTask } from "@/lib/services/calendar-tasks";

export type TaskState = { error?: string; ok?: string };

function fail(error: unknown): TaskState {
  if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
  if (error instanceof TaskError) return { error: error.message };
  throw error;
}

/**
 * Создание и правка задания одной формой.
 *
 * Срок приходит строкой в формате ISO (браузер переводит введённое местное
 * время в UTC), поэтому часовой пояс человека сервер не угадывает.
 */
export async function saveTaskAction(input: {
  id?: string;
  title: string;
  dueAt: string;
  assigneeId?: string;
  vacancyId?: string;
  candidateId?: string;
}): Promise<TaskState> {
  const actor = await requireAgencyActor();
  const dueAt = new Date(input.dueAt);

  try {
    const data = {
      title: input.title,
      dueAt,
      assigneeId: input.assigneeId || undefined,
      vacancyId: input.vacancyId || null,
      candidateId: input.candidateId || null,
    };
    if (input.id) await updateTask(actor, input.id, data);
    else await createTask(actor, data);
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/a/calendar");
  return { ok: input.id ? "Задание сохранено" : "Задание добавлено" };
}

export async function toggleTaskDoneAction(taskId: string, done: boolean): Promise<TaskState> {
  const actor = await requireAgencyActor();
  try {
    await setTaskDone(actor, taskId, done);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/a/calendar");
  return { ok: done ? "Выполнено" : "Возвращено в работу" };
}

export async function deleteTaskAction(taskId: string): Promise<TaskState> {
  const actor = await requireAgencyActor();
  try {
    await deleteTask(actor, taskId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/a/calendar");
  return { ok: "Задание удалено" };
}

/** Поиск кандидата для привязки к заданию (подсказка при вводе имени). */
export async function searchTaskCandidatesAction(
  query: string,
): Promise<{ id: string; fullName: string; hint: string }[]> {
  const actor = await requireAgencyActor();
  if (!canDo(actor, "task.manage") || !canDo(actor, "application.viewInternal")) return [];
  if (query.trim().length < 2) return [];

  const { items } = await searchCandidates(actor, { query, take: 8 });
  return items.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    hint: [c.currentPosition, c.city].filter(Boolean).join(" · "),
  }));
}
