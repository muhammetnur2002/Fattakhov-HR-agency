/**
 * Сводка отказов при добавлении студентов в кандидаты (замечание проверки PR #120, 12.10.2026).
 *
 * Каждый непринятый студент выводился отдельной `FormMessage` с `role="alert"` внутри области `aria-live`: при десяти
 * отказах читалка получала десять срочных объявлений подряд. Теперь причины собраны в одну строку.
 */
import { describe, expect, it } from "vitest";

import { summarizeFailures } from "@/lib/students-selection";

describe("summarizeFailures", () => {
  it("отказов нет — строки нет", () => {
    expect(summarizeFailures([])).toBeNull();
  });

  it("один отказ — его причина как есть", () => {
    expect(summarizeFailures([{ reason: "Студент не найден" }])).toBe("Студент не найден");
  });

  it("несколько с одной причиной — одна строка со счётчиком", () => {
    const failed = Array.from({ length: 10 }, () => ({ reason: "Студент не найден" }));
    expect(summarizeFailures(failed)).toBe("Не удалось добавить 10 студентов: Студент не найден (10)");
  });

  it("разные причины перечислены через точку с запятой, у повторяющейся — число", () => {
    expect(
      summarizeFailures([
        { reason: "Студент не найден" },
        { reason: "Платформа не ответила" },
        { reason: "Студент не найден" },
      ]),
    ).toBe("Не удалось добавить 3 студентов: Студент не найден (2); Платформа не ответила");
  });

  it("21 — «студента»: склонение по числу", () => {
    const failed = Array.from({ length: 21 }, () => ({ reason: "x" }));
    expect(summarizeFailures(failed)).toBe("Не удалось добавить 21 студента: x (21)");
  });
});
