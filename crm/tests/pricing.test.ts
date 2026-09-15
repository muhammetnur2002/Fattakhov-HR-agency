/**
 * Расчёт вознаграждения (ТЗ 12.1).
 *
 * Цена ошибки здесь — деньги в счёте клиенту, поэтому проверяются все
 * модели и граничные случаи, а не только счастливый путь.
 */
import { describe, expect, it } from "vitest";

import {
  describePricing,
  feePerHire,
  findPreset,
  hourlyCost,
  monthlyCost,
  prepaymentAmount,
  subscriptionBreakEven,
  TARIFF_PRESETS,
} from "@/lib/pricing";

describe("стоимость закрытия", () => {
  it("N окладов считается от месячного оклада", () => {
    const fee = feePerHire(
      { pricingModel: "PERCENT_MONTHLY", monthsCount: 2 },
      { monthlySalary: 150_000 },
    );
    expect(fee).toBe(300_000);
  });

  it("процент от годового дохода включает 12 окладов", () => {
    const fee = feePerHire(
      { pricingModel: "PERCENT_ANNUAL", percentRate: 15 },
      { monthlySalary: 200_000 },
    );
    // 200 000 × 12 × 15%
    expect(fee).toBe(360_000);
  });

  it("годовой бонус входит в базу расчёта", () => {
    const withoutBonus = feePerHire(
      { pricingModel: "PERCENT_ANNUAL", percentRate: 10 },
      { monthlySalary: 100_000 },
    );
    const withBonus = feePerHire(
      { pricingModel: "PERCENT_ANNUAL", percentRate: 10 },
      { monthlySalary: 100_000, annualBonus: 600_000 },
    );

    expect(withoutBonus).toBe(120_000);
    expect(withBonus).toBe(180_000);
  });

  it("фиксированная стоимость не зависит от оклада", () => {
    const low = feePerHire(
      { pricingModel: "FIXED_PER_HIRE", fixedAmount: 80_000 },
      { monthlySalary: 60_000 },
    );
    const high = feePerHire(
      { pricingModel: "FIXED_PER_HIRE", fixedAmount: 80_000 },
      { monthlySalary: 400_000 },
    );

    expect(low).toBe(80_000);
    expect(high).toBe(80_000);
  });

  it("для абонентской и почасовой цена за найм не определена", () => {
    expect(
      feePerHire(
        { pricingModel: "SUBSCRIPTION", subscriptionAmount: 150_000 },
        { monthlySalary: 150_000 },
      ),
    ).toBeNull();

    expect(
      feePerHire(
        { pricingModel: "HOURLY", hourlyRate: 3_000 },
        { monthlySalary: 150_000 },
      ),
    ).toBeNull();
  });

  it("незаполненные параметры дают ноль, а не NaN", () => {
    // Договор может быть сохранён с пустым полем — в счёте не должно
    // появиться NaN вместо суммы.
    expect(
      feePerHire({ pricingModel: "PERCENT_MONTHLY" }, { monthlySalary: 100_000 }),
    ).toBe(0);
    expect(
      feePerHire({ pricingModel: "PERCENT_ANNUAL" }, { monthlySalary: 100_000 }),
    ).toBe(0);
    expect(
      feePerHire({ pricingModel: "FIXED_PER_HIRE" }, { monthlySalary: 100_000 }),
    ).toBe(0);
  });

  it("результат округляется до целых рублей", () => {
    const fee = feePerHire(
      { pricingModel: "PERCENT_ANNUAL", percentRate: 15.5 },
      { monthlySalary: 133_333 },
    );
    expect(Number.isInteger(fee)).toBe(true);
  });
});

describe("абонентская и почасовая модели", () => {
  it("месячная стоимость определена только для подписки", () => {
    expect(
      monthlyCost({ pricingModel: "SUBSCRIPTION", subscriptionAmount: 150_000 }),
    ).toBe(150_000);
    expect(
      monthlyCost({ pricingModel: "PERCENT_MONTHLY", monthsCount: 2 }),
    ).toBeNull();
  });

  it("почасовая считается как ставка × часы", () => {
    expect(hourlyCost({ pricingModel: "HOURLY", hourlyRate: 3_000 }, 40)).toBe(
      120_000,
    );
    expect(
      hourlyCost({ pricingModel: "FIXED_PER_HIRE", fixedAmount: 1 }, 40),
    ).toBeNull();
  });

  it("точка окупаемости подписки — сколько закрытий в месяц", () => {
    // 150 000 абонплата против 80 000 за закрытие → выгодно от 2 закрытий
    expect(subscriptionBreakEven(150_000, 80_000)).toBe(2);
    expect(subscriptionBreakEven(150_000, 150_000)).toBe(1);
    expect(subscriptionBreakEven(300_000, 80_000)).toBe(4);
  });

  it("точка окупаемости не считается, если сравнивать не с чем", () => {
    expect(subscriptionBreakEven(150_000, null)).toBeNull();
    expect(subscriptionBreakEven(150_000, 0)).toBeNull();
    expect(subscriptionBreakEven(0, 80_000)).toBeNull();
  });
});

describe("предоплата", () => {
  it("считается процентом от суммы", () => {
    expect(prepaymentAmount(300_000, 30)).toBe(90_000);
    expect(prepaymentAmount(300_000, 0)).toBe(0);
    expect(prepaymentAmount(300_000, 100)).toBe(300_000);
  });
});

describe("пресеты тарифов", () => {
  it("каждый пресет заполнен под свою модель", () => {
    for (const preset of TARIFF_PRESETS) {
      switch (preset.pricingModel) {
        case "PERCENT_ANNUAL":
          expect(preset.percentRate, preset.key).toBeGreaterThan(0);
          break;
        case "PERCENT_MONTHLY":
          expect(preset.monthsCount, preset.key).toBeGreaterThan(0);
          break;
        case "FIXED_PER_HIRE":
          expect(preset.fixedAmount, preset.key).toBeGreaterThan(0);
          break;
        case "SUBSCRIPTION":
          expect(preset.subscriptionAmount, preset.key).toBeGreaterThan(0);
          expect(preset.subscriptionSlots, preset.key).toBeGreaterThan(0);
          break;
        case "HOURLY":
          expect(preset.hourlyRate, preset.key).toBeGreaterThan(0);
          break;
      }
    }
  });

  it("у каждого пресета есть гарантия и понятные условия оплаты", () => {
    for (const preset of TARIFF_PRESETS) {
      expect(preset.guaranteeDays, preset.key).toBeGreaterThan(0);
      expect(preset.paymentTerms.length, preset.key).toBeGreaterThan(10);
      expect(preset.prepaymentPercent, preset.key).toBeGreaterThanOrEqual(0);
      expect(preset.prepaymentPercent, preset.key).toBeLessThanOrEqual(100);
    }
  });

  it("ключи пресетов уникальны — по ним выбирается тариф в онбординге", () => {
    const keys = TARIFF_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("пресет находится по ключу", () => {
    expect(findPreset("monthly_2")?.pricingModel).toBe("PERCENT_MONTHLY");
    expect(findPreset("нет такого")).toBeUndefined();
  });
});

describe("описание условий", () => {
  it("склоняет оклады по-русски", () => {
    expect(
      describePricing({ pricingModel: "PERCENT_MONTHLY", monthsCount: 1 }),
    ).toContain("1 оклад ");
    expect(
      describePricing({ pricingModel: "PERCENT_MONTHLY", monthsCount: 2 }),
    ).toContain("2 оклада");
    expect(
      describePricing({ pricingModel: "PERCENT_MONTHLY", monthsCount: 5 }),
    ).toContain("5 окладов");
  });

  it("описывает каждую модель без пустых мест", () => {
    const models = [
      { pricingModel: "PERCENT_ANNUAL" as const, percentRate: 15 },
      { pricingModel: "PERCENT_MONTHLY" as const, monthsCount: 2 },
      { pricingModel: "FIXED_PER_HIRE" as const, fixedAmount: 80_000 },
      {
        pricingModel: "SUBSCRIPTION" as const,
        subscriptionAmount: 150_000,
        subscriptionSlots: 5,
      },
      { pricingModel: "HOURLY" as const, hourlyRate: 3_000 },
    ];

    for (const m of models) {
      const text = describePricing(m);
      expect(text.length, m.pricingModel).toBeGreaterThan(5);
      expect(text, m.pricingModel).not.toContain("undefined");
      expect(text, m.pricingModel).not.toContain("NaN");
    }
  });
});
