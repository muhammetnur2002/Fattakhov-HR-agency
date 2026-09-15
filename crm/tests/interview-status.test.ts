/**
 * Стейт-машина интервью и правила слотов (ТЗ 6.3, BR-15).
 *
 * Чистая логика без БД. Отдельно от неё в interviews.test.ts проверяется
 * трёхстороннее согласование на реальных данных.
 */
import { describe, expect, it } from "vitest";

import type { InterviewStatus } from "@/lib/generated/prisma/enums";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  InterviewError,
  isOpen,
  isScheduled,
  needsSlots,
  overlaps,
  isSlotPast,
  validateSlots,
} from "@/lib/services/interview-status";

const ALL: InterviewStatus[] = [
  "SLOTS_REQUESTED",
  "SLOTS_PROPOSED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

describe("переходы встречи", () => {
  it("описаны для каждого статуса", () => {
    for (const s of ALL) expect(ALLOWED_TRANSITIONS[s], s).toBeDefined();
  });

  it("основной путь: запросили → предложили → подтвердили → провели", () => {
    expect(canTransition("SLOTS_REQUESTED", "SLOTS_PROPOSED")).toBe(true);
    expect(canTransition("SLOTS_PROPOSED", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "COMPLETED")).toBe(true);
  });

  it("кандидату не подошло — возвращаемся к подбору времени", () => {
    expect(canTransition("SLOTS_PROPOSED", "SLOTS_REQUESTED")).toBe(true);
  });

  it("перенос возвращает встречу к выбору времени", () => {
    expect(canTransition("CONFIRMED", "RESCHEDULE_REQUESTED")).toBe(true);
    expect(canTransition("RESCHEDULE_REQUESTED", "SLOTS_PROPOSED")).toBe(true);
  });

  it("после неявки можно назначить заново", () => {
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransition("NO_SHOW", "SLOTS_REQUESTED")).toBe(true);
  });

  it("нельзя подтвердить встречу, по которой не предлагали времени", () => {
    expect(canTransition("SLOTS_REQUESTED", "CONFIRMED")).toBe(false);
  });

  it("нельзя провести встречу, время которой не подтверждено", () => {
    for (const from of ["SLOTS_REQUESTED", "SLOTS_PROPOSED"] as const) {
      expect(canTransition(from, "COMPLETED"), from).toBe(false);
    }
  });

  it("проведённая и отменённая — конечные", () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("статус не переходит сам в себя", () => {
    for (const s of ALL) expect(canTransition(s, s), s).toBe(false);
  });
});

describe("признаки статуса", () => {
  it("в календарь попадает только подтверждённая", () => {
    expect(ALL.filter(isScheduled)).toEqual(["CONFIRMED"]);
  });

  it("открытыми считаются четыре состояния", () => {
    expect(ALL.filter(isOpen)).toEqual([
      "SLOTS_REQUESTED",
      "SLOTS_PROPOSED",
      "CONFIRMED",
      "RESCHEDULE_REQUESTED",
    ]);
  });

  it("задача «предложить слоты» — это запрос и перенос", () => {
    expect(ALL.filter(needsSlots)).toEqual([
      "SLOTS_REQUESTED",
      "RESCHEDULE_REQUESTED",
    ]);
  });
});

describe("BR-15: правила слотов", () => {
  const now = new Date("2026-08-10T09:00:00Z");
  const slot = (dayOffset: number, hour: number) => ({
    startsAt: new Date(Date.UTC(2026, 7, 10 + dayOffset, hour, 0)),
    endsAt: new Date(Date.UTC(2026, 7, 10 + dayOffset, hour + 1, 0)),
  });

  it("два-пять вариантов проходят", () => {
    expect(() => validateSlots([slot(1, 10), slot(1, 12)], now)).not.toThrow();
    expect(() =>
      validateSlots(
        [slot(1, 10), slot(1, 12), slot(2, 10), slot(2, 12), slot(3, 10)],
        now,
      ),
    ).not.toThrow();
  });

  it("один вариант — это не выбор", () => {
    expect(() => validateSlots([slot(1, 10)], now)).toThrow(InterviewError);
  });

  it("больше пяти не помогает", () => {
    const six = [
      slot(1, 10),
      slot(1, 12),
      slot(2, 10),
      slot(2, 12),
      slot(3, 10),
      slot(3, 12),
    ];
    expect(() => validateSlots(six, now)).toThrow(/Не больше/);
  });

  it("слот в прошлом отклоняется", () => {
    expect(() => validateSlots([slot(-1, 10), slot(1, 12)], now)).toThrow(
      /в прошлом/,
    );
  });

  it("конец раньше начала отклоняется", () => {
    const broken = {
      startsAt: new Date(Date.UTC(2026, 7, 12, 12, 0)),
      endsAt: new Date(Date.UTC(2026, 7, 12, 11, 0)),
    };
    expect(() => validateSlots([broken, slot(1, 10)], now)).toThrow(
      /раньше начала/,
    );
  });

  it("пересекающиеся варианты — почти наверняка опечатка", () => {
    const a = {
      startsAt: new Date(Date.UTC(2026, 7, 12, 10, 0)),
      endsAt: new Date(Date.UTC(2026, 7, 12, 11, 30)),
    };
    const b = {
      startsAt: new Date(Date.UTC(2026, 7, 12, 11, 0)),
      endsAt: new Date(Date.UTC(2026, 7, 12, 12, 0)),
    };
    expect(() => validateSlots([a, b], now)).toThrow(/пересекаются/);
  });

  it("вплотную идущие варианты пересечением не считаются", () => {
    const a = {
      startsAt: new Date(Date.UTC(2026, 7, 12, 10, 0)),
      endsAt: new Date(Date.UTC(2026, 7, 12, 11, 0)),
    };
    const b = {
      startsAt: new Date(Date.UTC(2026, 7, 12, 11, 0)),
      endsAt: new Date(Date.UTC(2026, 7, 12, 12, 0)),
    };
    expect(() => validateSlots([a, b], now)).not.toThrow();
  });
});

describe("пересечение интервалов (BR-16)", () => {
  const range = (fromHour: number, toHour: number) => ({
    startsAt: new Date(Date.UTC(2026, 7, 12, fromHour, 0)),
    endsAt: new Date(Date.UTC(2026, 7, 12, toHour, 0)),
  });

  it("накладка находится", () => {
    expect(overlaps(range(10, 11), range(10, 12))).toBe(true);
    expect(overlaps(range(10, 12), range(11, 13))).toBe(true);
  });

  it("встречи подряд накладкой не считаются", () => {
    expect(overlaps(range(10, 11), range(11, 12))).toBe(false);
  });

  it("разнесённые встречи не пересекаются", () => {
    expect(overlaps(range(10, 11), range(14, 15))).toBe(false);
  });
});

describe("вариант времени, который выбрать уже нельзя", () => {
  const now = new Date("2026-09-11T12:00:00Z");

  it("прошедшее время — не выбор", () => {
    expect(isSlotPast(new Date("2026-09-11T11:59:00Z"), now)).toBe(true);
  });

  it("будущее — выбор", () => {
    expect(isSlotPast(new Date("2026-09-11T12:01:00Z"), now)).toBe(false);
  });

  it("ровно сейчас — уже поздно", () => {
    // Граница включающая, и это важно: раньше экран кандидата считал
    // «строго раньше», а сервер «сейчас или раньше», и на этой
    // миллисекунде экран предлагал то, что сервер отвергал
    expect(isSlotPast(new Date("2026-09-11T12:00:00Z"), now)).toBe(true);
  });

  it("тем же правилом проверяется предложение слотов", () => {
    // validateSlots не должен расходиться с экраном выбора: оба
    // спрашивают isSlotPast
    expect(() =>
      validateSlots(
        [
          { startsAt: new Date("2026-09-11T12:00:00Z"), endsAt: new Date("2026-09-11T13:00:00Z") },
          { startsAt: new Date("2026-09-12T10:00:00Z"), endsAt: new Date("2026-09-12T11:00:00Z") },
        ],
        now,
      ),
    ).toThrow(/прошлом/);
  });
});
