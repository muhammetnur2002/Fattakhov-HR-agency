/**
 * Разбор брифа из формы.
 *
 * Тесты здесь про то, как HTML-форма присылает значения: пустые строки
 * вместо null и «true»/«false» вместо булевых. Обе ловушки уже один раз
 * сработали при сборке мастера, поэтому зафиксированы.
 */
import { describe, expect, it } from "vitest";

import {
  vacancyDraftSchema,
  vacancyEstimateSchema,
  vacancySubmitSchema,
} from "@/lib/validation/vacancy";

describe("значения из формы", () => {
  it("незаполненный select не ломает разбор", () => {
    // <select> без выбора присылает "", а не отсутствие поля
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      workFormat: "",
      employmentType: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workFormat).toBeUndefined();
      expect(result.data.employmentType).toBeUndefined();
    }
  });

  it("заполненный select проходит как значение enum", () => {
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      workFormat: "HYBRID",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.workFormat).toBe("HYBRID");
  });

  it("мусор в enum отклоняется", () => {
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      workFormat: "ANYWHERE",
    });
    expect(result.success).toBe(false);
  });

  it('строка "false" остаётся ложью, а не превращается в истину', () => {
    // Классическая ловушка: Boolean("false") === true, и вилка «на руки»
    // молча стала бы «до вычета налога»
    const net = vacancyDraftSchema.safeParse({
      title: "Логист",
      salaryGross: "false",
    });
    expect(net.success).toBe(true);
    if (net.success) expect(net.data.salaryGross).toBe(false);

    const gross = vacancyDraftSchema.safeParse({
      title: "Логист",
      salaryGross: "true",
    });
    if (gross.success) expect(gross.data.salaryGross).toBe(true);
  });

  it("пустые текстовые поля не превращаются в пустые строки в БД", () => {
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      department: "",
      city: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.department).toBeUndefined();
      expect(result.data.city).toBeUndefined();
    }
  });

  it("вилка приходит строками и становится числами", () => {
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      salaryFrom: "80000",
      salaryTo: "120000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salaryFrom).toBe(80_000);
      expect(result.data.salaryTo).toBe(120_000);
    }
  });

  it("пустая вилка не превращается в ноль", () => {
    // Ноль в вилке выглядел бы как «зарплата 0», а не «не указана»
    const result = vacancyDraftSchema.safeParse({
      title: "Логист",
      salaryFrom: "",
      salaryTo: "",
    });
    if (result.success) {
      expect(result.data.salaryFrom).toBeUndefined();
      expect(result.data.salaryTo).toBeUndefined();
    }
  });
});

describe("отправка заявки в работу", () => {
  it("требует заполненных обязанностей и требований", () => {
    const result = vacancySubmitSchema.safeParse({
      title: "Логист",
      responsibilities: "мало",
      requirements: "тоже мало",
    });
    expect(result.success).toBe(false);
  });

  it("пропускает содержательный бриф", () => {
    const result = vacancySubmitSchema.safeParse({
      title: "Логист-диспетчер",
      responsibilities:
        "Планирование маршрутов, работа с водителями, контроль сроков доставки.",
      requirements:
        "Опыт диспетчеризации от двух лет, знание 1С, готовность к сменам.",
    });
    expect(result.success).toBe(true);
  });

  it("название короче трёх символов не проходит", () => {
    const result = vacancySubmitSchema.safeParse({
      title: "ИТ",
      responsibilities: "а".repeat(40),
      requirements: "б".repeat(40),
    });
    expect(result.success).toBe(false);
  });
});

describe("BR-2: оценка сроков", () => {
  it("без даты первых кандидатов не принимается", () => {
    expect(
      vacancyEstimateSchema.safeParse({ estimatedFirstCandidatesAt: "" }).success,
    ).toBe(false);
  });

  it("с датой принимается", () => {
    const result = vacancyEstimateSchema.safeParse({
      estimatedFirstCandidatesAt: "2026-08-20",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedFirstCandidatesAt).toBeInstanceOf(Date);
    }
  });

  it("некорректная дата отклоняется", () => {
    expect(
      vacancyEstimateSchema.safeParse({
        estimatedFirstCandidatesAt: "не дата",
      }).success,
    ).toBe(false);
  });
});
