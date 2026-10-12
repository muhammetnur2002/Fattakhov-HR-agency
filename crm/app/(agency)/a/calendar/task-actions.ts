"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AccessDeniedError, canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { fromMoscowInput, isDayKey, startOfDay } from "@/lib/calendar/moscow";
import { formatRule } from "@/lib/calendar/recurrence";
import { searchCandidates } from "@/lib/services/candidates";
import {
  createTask,
  deleteTask,
  setTaskDone,
  TaskError,
  updateTask,
  type TaskInput,
} from "@/lib/services/calendar-tasks";

export type TaskState = { error?: string; ok?: string };

function fail(error: unknown): TaskState {
  if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
  if (error instanceof TaskError) return { error: error.message };
  throw error;
}

const scopeSchema = z.enum(["this", "following", "all"]);
/** Вхождение серии: начало по правилу, ISO-момент. */
const occurrenceSchema = z.string().datetime().optional();

const taskFormSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string(),
  description: z.string().optional(),
  /** Московское время из поля datetime-local: 2026-10-12T14:30. */
  startsLocal: z.string(),
  durationMinutes: z.number().int(),
  hasDeadline: z.boolean(),
  assigneeId: z.string().optional(),
  remindBeforeMinutes: z.number().int().nullable(),
  repeat: z.enum(["none", "DAILY", "WEEKLY", "MONTHLY"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  /** Последний день повторов, 2026-12-31, или пусто. */
  untilDate: z.string(),
  vacancyId: z.string().optional(),
  candidateId: z.string().optional(),
  scope: scopeSchema.optional(),
  occurrence: occurrenceSchema,
});

export type TaskFormInput = z.input<typeof taskFormSchema>;

function toTaskInput(form: z.output<typeof taskFormSchema>): TaskInput {
  const startsAt = fromMoscowInput(form.startsLocal);
  let recurrenceRule: string | null = null;
  if (form.repeat === "WEEKLY") recurrenceRule = formatRule({ freq: "WEEKLY", days: form.weekdays });
  else if (form.repeat !== "none") recurrenceRule = form.repeat;

  if (form.untilDate && !isDayKey(form.untilDate)) throw new TaskError("Некорректная дата окончания повторов");

  return {
    title: form.title,
    description: form.description,
    startsAt,
    durationMinutes: form.durationMinutes,
    hasDeadline: form.hasDeadline,
    assigneeId: form.assigneeId || undefined,
    remindBeforeMinutes: form.remindBeforeMinutes,
    recurrenceRule,
    recurrenceUntil: recurrenceRule && form.untilDate ? startOfDay(form.untilDate) : null,
    vacancyId: form.vacancyId || null,
    candidateId: form.candidateId || null,
  };
}

/**
 * Создание и правка задачи одной формой.
 *
 * Время приходит московским «настенным» временем (поле datetime-local) и читается
 * сервером в поясе Москвы: часовой пояс браузера и сервера значения не имеет.
 * Все проверки прав — в сервисном слое, здесь только разбор ввода.
 */
export async function saveTaskAction(input: TaskFormInput): Promise<TaskState> {
  const actor = await requireAgencyActor();
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return { error: "Проверьте поля формы" };
  const form = parsed.data;

  try {
    const data = toTaskInput(form);
    if (form.id) {
      await updateTask(actor, form.id, data, {
        scope: form.scope,
        occurrence: form.occurrence ? new Date(form.occurrence) : undefined,
      });
    } else {
      await createTask(actor, data);
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/a/calendar");
  return { ok: form.id ? "Задача сохранена" : "Задача добавлена" };
}

export async function toggleTaskDoneAction(
  taskId: string,
  done: boolean,
  occurrence?: string,
): Promise<TaskState> {
  const actor = await requireAgencyActor();
  const parsed = occurrenceSchema.safeParse(occurrence);
  if (!parsed.success) return { error: "Проверьте поля формы" };
  try {
    await setTaskDone(actor, taskId, done, {
      occurrence: parsed.data ? new Date(parsed.data) : undefined,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/a/calendar");
  return { ok: done ? "Выполнено" : "Возвращено в работу" };
}

export async function deleteTaskAction(
  taskId: string,
  scope?: "this" | "following" | "all",
  occurrence?: string,
): Promise<TaskState> {
  const actor = await requireAgencyActor();
  const parsedScope = scopeSchema.optional().safeParse(scope);
  const parsedOccurrence = occurrenceSchema.safeParse(occurrence);
  if (!parsedScope.success || !parsedOccurrence.success) return { error: "Проверьте поля формы" };
  try {
    await deleteTask(actor, taskId, {
      scope: parsedScope.data,
      occurrence: parsedOccurrence.data ? new Date(parsedOccurrence.data) : undefined,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/a/calendar");
  return { ok: "Задача удалена" };
}

/** Поиск кандидата для привязки к задаче (подсказка при вводе имени). */
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
