/**
 * Стейт-машина вакансии (ТЗ 6.1).
 *
 * Проверяется закрытость списка переходов: не только «что разрешено»,
 * но и что всё остальное запрещено. Дыра в стейт-машине означает вакансию
 * в работе без договора или закрытую без причины.
 */
import { describe, expect, it } from "vitest";

import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  clientCanEditBrief,
  isClosed,
  isReactivation,
  isRunning,
  requiresCloseReason,
} from "@/lib/services/vacancy-status";

const ALL_STATUSES: VacancyStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "CLARIFYING",
  "ESTIMATED",
  "ACTIVE",
  "ON_HOLD",
  "CLOSED_SUCCESS",
  "CLOSED_CANCELLED",
  "CLOSED_FAILED",
];

describe("разрешённые переходы", () => {
  it("описаны для каждого статуса", () => {
    for (const status of ALL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status], status).toBeDefined();
    }
  });

  it("путь заявки: черновик → отправлена → в работе", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "ACTIVE")).toBe(true);
  });

  it("путь с уточнениями: вопросы туда и обратно", () => {
    expect(canTransition("SUBMITTED", "CLARIFYING")).toBe(true);
    expect(canTransition("CLARIFYING", "SUBMITTED")).toBe(true);
  });

  it("путь с оценкой сроков", () => {
    expect(canTransition("SUBMITTED", "ESTIMATED")).toBe(true);
    expect(canTransition("ESTIMATED", "ACTIVE")).toBe(true);
  });

  it("пауза обратима", () => {
    expect(canTransition("ACTIVE", "ON_HOLD")).toBe(true);
    expect(canTransition("ON_HOLD", "ACTIVE")).toBe(true);
  });

  it("черновик нельзя запустить в работу в обход отправки", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransition("DRAFT", "CLOSED_SUCCESS")).toBe(false);
  });

  it("нельзя закрыть наймом вакансию, которая не была в работе", () => {
    for (const from of ["DRAFT", "SUBMITTED", "CLARIFYING", "ESTIMATED"] as const) {
      expect(canTransition(from, "CLOSED_SUCCESS"), from).toBe(false);
    }
  });

  it("на паузе нельзя закрыть наймом — сначала вернуть в работу", () => {
    expect(canTransition("ON_HOLD", "CLOSED_SUCCESS")).toBe(false);
  });

  it("из закрытых статусов ведёт только реактивация", () => {
    for (const from of [
      "CLOSED_SUCCESS",
      "CLOSED_CANCELLED",
      "CLOSED_FAILED",
    ] as const) {
      expect(ALLOWED_TRANSITIONS[from], from).toEqual(["ACTIVE"]);
    }
  });

  it("статус не переходит сам в себя", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status), status).toBe(false);
    }
  });

  it("в DRAFT не возвращаются ниоткуда — черновик бывает только в начале", () => {
    for (const from of ALL_STATUSES) {
      expect(canTransition(from, "DRAFT"), from).toBe(false);
    }
  });
});

describe("признаки статуса", () => {
  it("закрытыми считаются три статуса", () => {
    expect(ALL_STATUSES.filter(isClosed)).toEqual([
      "CLOSED_SUCCESS",
      "CLOSED_CANCELLED",
      "CLOSED_FAILED",
    ]);
  });

  it("в работе — только ACTIVE", () => {
    expect(ALL_STATUSES.filter(isRunning)).toEqual(["ACTIVE"]);
  });

  it("реактивация — это возврат из закрытого в работу", () => {
    expect(isReactivation("CLOSED_SUCCESS", "ACTIVE")).toBe(true);
    expect(isReactivation("CLOSED_FAILED", "ACTIVE")).toBe(true);
    expect(isReactivation("ON_HOLD", "ACTIVE")).toBe(false);
    expect(isReactivation("ESTIMATED", "ACTIVE")).toBe(false);
  });

  it("причина обязательна при отмене и провале, но не при найме", () => {
    expect(requiresCloseReason("CLOSED_CANCELLED")).toBe(true);
    expect(requiresCloseReason("CLOSED_FAILED")).toBe(true);
    expect(requiresCloseReason("CLOSED_SUCCESS")).toBe(false);
    expect(requiresCloseReason("ON_HOLD")).toBe(false);
  });
});

describe("BR-21: правка брифа клиентом", () => {
  it("разрешена, пока заявка не в работе", () => {
    expect(clientCanEditBrief("DRAFT")).toBe(true);
    expect(clientCanEditBrief("SUBMITTED")).toBe(true);
    expect(clientCanEditBrief("CLARIFYING")).toBe(true);
  });

  it("запрещена с момента запуска и дальше", () => {
    for (const status of [
      "ESTIMATED",
      "ACTIVE",
      "ON_HOLD",
      "CLOSED_SUCCESS",
      "CLOSED_CANCELLED",
      "CLOSED_FAILED",
    ] as const) {
      expect(clientCanEditBrief(status), status).toBe(false);
    }
  });
});
