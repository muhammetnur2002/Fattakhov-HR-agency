/**
 * Рабочие часы (BR-9).
 *
 * Ошибка здесь тихая: рекрутер начинает получать «клиент не отвечает»
 * по кандидатам, представленным в пятницу вечером, перестаёт доверять
 * этим сигналам и пропускает настоящие просрочки.
 */
import { describe, expect, it } from "vitest";

import { businessHoursBetween, isOverdueBySla, isWorkday } from "@/lib/services/sla";

/** Локальное время: SLA считается в часах работы клиента. */
function at(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("рабочие дни", () => {
  it("будни рабочие, выходные нет", () => {
    // 10 августа 2026 — понедельник
    expect(isWorkday(at(2026, 8, 10, 12))).toBe(true);
    expect(isWorkday(at(2026, 8, 14, 12))).toBe(true);
    expect(isWorkday(at(2026, 8, 15, 12))).toBe(false);
    expect(isWorkday(at(2026, 8, 16, 12))).toBe(false);
  });
});

describe("подсчёт рабочих часов", () => {
  it("внутри одного рабочего дня считает напрямую", () => {
    const hours = businessHoursBetween(
      at(2026, 8, 10, 10),
      at(2026, 8, 10, 15),
    );
    expect(hours).toBeCloseTo(5, 1);
  });

  it("ночь между днями не считается", () => {
    // Понедельник 18:00 → вторник 10:00: рабочими будут час вечера
    // и час утра, а не шестнадцать календарных
    const hours = businessHoursBetween(
      at(2026, 8, 10, 18),
      at(2026, 8, 11, 10),
    );
    expect(hours).toBeCloseTo(2, 1);
  });

  it("выходные не считаются", () => {
    // Пятница 18:00 → понедельник 10:00
    const hours = businessHoursBetween(
      at(2026, 8, 14, 18),
      at(2026, 8, 17, 10),
    );
    expect(hours).toBeCloseTo(2, 1);
  });

  it("полный рабочий день это десять часов", () => {
    const hours = businessHoursBetween(
      at(2026, 8, 10, 0),
      at(2026, 8, 11, 0),
    );
    expect(hours).toBeCloseTo(10, 1);
  });

  it("трое календарных суток дают около тридцати рабочих часов", () => {
    // Ровно та ситуация, из-за которой считаем в рабочих:
    // трое суток ожидания это не 72 часа норматива
    const hours = businessHoursBetween(
      at(2026, 8, 10, 12),
      at(2026, 8, 13, 12),
    );
    expect(hours).toBeGreaterThan(25);
    expect(hours).toBeLessThan(35);
  });

  it("обратный порядок дат даёт ноль, а не отрицательное", () => {
    expect(
      businessHoursBetween(at(2026, 8, 13, 12), at(2026, 8, 10, 12)),
    ).toBe(0);
  });

  it("одинаковые моменты дают ноль", () => {
    const moment = at(2026, 8, 10, 12);
    expect(businessHoursBetween(moment, moment)).toBe(0);
  });
});

describe("просрочка норматива", () => {
  it("без норматива просрочки не бывает", () => {
    expect(isOverdueBySla(at(2026, 1, 1, 10), null, at(2026, 8, 10, 10))).toBe(
      false,
    );
  });

  it("трое суток не просрочивают норматив в 72 рабочих часа", () => {
    // Клиент физически не мог отреагировать — обвинять его рано
    expect(
      isOverdueBySla(at(2026, 8, 10, 12), 72, at(2026, 8, 13, 12)),
    ).toBe(false);
  });

  it("полторы недели ожидания норматив просрочивают", () => {
    expect(
      isOverdueBySla(at(2026, 8, 10, 12), 72, at(2026, 8, 21, 12)),
    ).toBe(true);
  });

  it("выходные не приближают просрочку", () => {
    // Представили в пятницу вечером — в понедельник утром норматив
    // в 10 рабочих часов ещё не вышел
    expect(
      isOverdueBySla(at(2026, 8, 14, 18), 10, at(2026, 8, 17, 10)),
    ).toBe(false);
  });
});
