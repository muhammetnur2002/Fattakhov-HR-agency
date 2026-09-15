"use server";

import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  confirmSlot,
  InterviewError,
  requestOtherSlots,
} from "@/lib/services/interviews";

export type ScheduleState = {
  error?: string;
  confirmed?: boolean;
  asked?: boolean;
  /** Что сохранилось на сервере, ISO. Экран успеха показывает именно это. */
  scheduledAt?: string;
};

/**
 * Кандидат выбрал время.
 *
 * Действие публичное: у кандидата нет аккаунта, и вся защита — в токене.
 * Поэтому здесь никаких данных из формы, кроме токена и id слота:
 * что кому принадлежит, решает сервис.
 */
export async function confirmSlotAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const token = String(formData.get("token") || "");
  const slotId = String(formData.get("slotId") || "");

  if (!slotId) return { error: "Выберите время" };

  let scheduledAt: Date;
  try {
    ({ scheduledAt } = await confirmSlot(token, slotId));
  } catch (error) {
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }

  // Намеренно без revalidatePath: токен только что погашен, и перерисовка
  // страницы показала бы кандидату «ссылка недействительна» вместо
  // подтверждения. Экран успеха рисует клиентский компонент.
  //
  // Время возвращаем с сервера, а не берём из выбора на экране: кандидат
  // должен увидеть то, что действительно записано. Разойтись эти два
  // значения могут — например, если рекрутер сменил варианты, пока
  // кандидат держал страницу открытой.
  return { confirmed: true, scheduledAt: scheduledAt.toISOString() };
}

/** Ни один вариант не подошёл — возвращаем задачу рекрутеру. */
export async function requestOtherSlotsAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const token = String(formData.get("token") || "");
  const note = String(formData.get("note") || "");

  if (!note.trim()) {
    return { error: "Напишите, когда вам удобно — так мы подберём быстрее" };
  }

  try {
    await requestOtherSlots(token, note);
  } catch (error) {
    if (error instanceof InterviewError) return { error: error.message };
    throw error;
  }

  return { asked: true };
}
