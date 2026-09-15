/**
 * Стейт-машина интервью (ТЗ 6.3).
 *
 * Чистый модуль без БД: правила переходов проверяются отдельно от того,
 * как они вызываются. Само выполнение — в services/interviews.ts.
 */
import type { InterviewStatus } from "@/lib/generated/prisma/enums";

export const ALLOWED_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  // Клиент пригласил — рекрутер должен предложить время
  SLOTS_REQUESTED: ["SLOTS_PROPOSED", "CANCELLED"],

  // Слоты у кандидата. Он выбирает, либо истекает срок ссылки
  SLOTS_PROPOSED: ["CONFIRMED", "SLOTS_REQUESTED", "CANCELLED"],

  CONFIRMED: ["RESCHEDULE_REQUESTED", "COMPLETED", "CANCELLED", "NO_SHOW"],

  // Перенос возвращает к подбору времени
  RESCHEDULE_REQUESTED: ["SLOTS_PROPOSED", "SLOTS_REQUESTED", "CANCELLED"],

  // Не пришёл — можно назначить заново
  NO_SHOW: ["SLOTS_REQUESTED", "CANCELLED"],

  // Конечные
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(
  from: InterviewStatus,
  to: InterviewStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Встреча ещё в работе: её видно в календаре и в задачах. */
export function isOpen(status: InterviewStatus): boolean {
  return (
    status === "SLOTS_REQUESTED" ||
    status === "SLOTS_PROPOSED" ||
    status === "CONFIRMED" ||
    status === "RESCHEDULE_REQUESTED"
  );
}

/** Время подтверждено — событие попадает в календарь и в .ics. */
export function isScheduled(status: InterviewStatus): boolean {
  return status === "CONFIRMED";
}

/** Задача рекрутера: нужно предложить слоты. */
export function needsSlots(status: InterviewStatus): boolean {
  return status === "SLOTS_REQUESTED" || status === "RESCHEDULE_REQUESTED";
}

export const MIN_SLOTS = 2;
export const MAX_SLOTS = 5;

/** Срок жизни ссылки для кандидата — неделя (ТЗ 10.2). */
export const SLOT_TOKEN_TTL_DAYS = 7;

export class InterviewError extends Error {}

/**
 * BR-15: слотов от двух до пяти, и ни один не в прошлом.
 *
 * Один слот — это не выбор, а ультиматум: кандидат либо подстраивается,
 * либо начинается переписка, ради устранения которой всё и делалось.
 * Больше пяти — уже не помогает, а перегружает.
 */
/**
 * Вариант времени, который выбрать уже нельзя.
 *
 * Правило живёт здесь, а не в трёх местах: его спрашивает проверка
 * при предложении слотов, проверка при подтверждении и экран выбора,
 * который кандидат видит. Раньше экран считал по-своему («строго
 * раньше сейчас») и расходился с сервером («сейчас или раньше»)
 * ровно на текущую миллисекунду — мелочь, но именно так и разъезжаются
 * правила, записанные дважды.
 *
 * Граница включающая: «сейчас» — уже не выбор. Встречу, начинающуюся
 * в эту секунду, согласовывать поздно.
 */
export function isSlotPast(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt <= now;
}

export function validateSlots(
  slots: { startsAt: Date; endsAt: Date }[],
  now: Date = new Date(),
): void {
  if (slots.length < MIN_SLOTS) {
    throw new InterviewError(
      `Предложите минимум ${MIN_SLOTS} варианта времени — один это не выбор`,
    );
  }
  if (slots.length > MAX_SLOTS) {
    throw new InterviewError(`Не больше ${MAX_SLOTS} вариантов`);
  }

  for (const slot of slots) {
    if (Number.isNaN(slot.startsAt.getTime())) {
      throw new InterviewError("Некорректное время слота");
    }
    if (isSlotPast(slot.startsAt, now)) {
      throw new InterviewError("Слот в прошлом — выберите будущее время");
    }
    if (slot.endsAt <= slot.startsAt) {
      throw new InterviewError("Конец слота раньше начала");
    }
  }

  // Пересекающиеся слоты внутри одного предложения — почти наверняка
  // опечатка: кандидату всё равно предлагают выбрать один
  const sorted = [...slots].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsAt < sorted[i - 1].endsAt) {
      throw new InterviewError("Слоты пересекаются между собой");
    }
  }
}

/** Пересекаются ли два интервала. Нужно для предупреждения BR-16. */
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
