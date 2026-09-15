/**
 * Расчёт стоимости своей команды найма.
 *
 * Это заявление о деньгах на публичной странице: его будут проверять
 * калькулятором, и первым это сделает финансовый директор клиента.
 * Поэтому проверяется не «функция что-то вернула», а сама арифметика
 * и то, что в неё не затесался НДФЛ.
 */
import { describe, expect, it } from "vitest";

import {
  COMPARABLE_TARIFF,
  CONTRIBUTIONS_RATE,
  INHOUSE_ROLES,
  PAID_MONTHS,
  TOOLS_COST,
  WORKED_MONTHS,
  annualSavings,
  TARIFFS,
  idleCost,
  inhouseMonthlyCost,
  pricePerSlot,
  savingsPercent,
} from "@/lib/marketing/inhouse-cost";

describe("стоимость своей команды", () => {
  it("складывает оклады, взносы и инструменты", () => {
    const r = inhouseMonthlyCost();

    expect(r.salaries).toBe(400_000);
    expect(r.contributions).toBe(120_000);
    expect(r.tools).toBe(70_000);
    expect(r.total).toBe(590_000);
  });

  it("итог равен сумме частей, а не отдельному числу", () => {
    const r = inhouseMonthlyCost();
    // Иначе на странице появится красивая цифра, не связанная с разбивкой
    expect(r.total).toBe(r.salaries + r.contributions + r.tools);
  });

  it("взносы считаются от окладов, а не от итога", () => {
    const r = inhouseMonthlyCost();
    expect(r.contributions).toBe(Math.round(r.salaries * CONTRIBUTIONS_RATE));
  });

  it("НДФЛ не прибавляется к расходам работодателя", () => {
    const r = inhouseMonthlyCost();
    // Налог удерживается из оклада, а не сверх него. Прибавить его -
    // типичная ошибка, на которой такие расчёты и ловят
    const сОшибкой = r.salaries * (1 + CONTRIBUTIONS_RATE + 0.13) + TOOLS_COST;
    expect(r.total).toBeLessThan(сОшибкой);
  });

  it("подчиняется своим параметрам, а не зашитым числам", () => {
    const r = inhouseMonthlyCost(
      [{ role: "Рекрутер", salary: 100_000, note: "" }],
      0.15,
      0,
    );
    expect(r.total).toBe(115_000);
  });

  it("в разбивке нет ролей с нулевым окладом", () => {
    // Пустая строка в таблице читается как недоделка
    for (const role of INHOUSE_ROLES) {
      expect(role.salary, role.role).toBeGreaterThan(0);
      expect(role.note.length, role.role).toBeGreaterThan(0);
    }
  });
});

describe("экономия в процентах", () => {
  it("считает разницу от стоимости своей команды", () => {
    expect(savingsPercent(590_000, 100_000)).toBe(83);
  });

  it("округляет вниз", () => {
    // Заявлять 84 при 83.4 нечестно, и это ровно тот разряд,
    // который проверяют первым
    expect(savingsPercent(600_000, 100_000)).toBe(83);
  });

  it("не ломается на нуле и на подписке дороже своей команды", () => {
    expect(savingsPercent(0, 100_000)).toBe(0);
    expect(savingsPercent(100_000, 150_000)).toBeLessThan(0);
  });
});

describe("годовая экономия", () => {
  it("считается по сопоставимой конфигурации, а не по цене входа", () => {
    const inhouse = inhouseMonthlyCost().total;
    // Иначе на первом экране стояла бы разница между отделом
    // и одним рекрутером, а это разные объёмы работы
    expect(annualSavings()).toBe((inhouse - COMPARABLE_TARIFF.price) * 12);
    expect(annualSavings()).toBe(4_980_000);
  });

  it("не уходит в минус, если подписка дороже штата", () => {
    expect(annualSavings(100_000, 200_000)).toBe(0);
  });
});

describe("оплаченные, но неотработанные месяцы", () => {
  it("месяц простоя стоит столько же, сколько месяц работы", () => {
    // В этом и весь довод: штат не дешевеет от отсутствия вакансий
    expect(idleCost(1)).toBe(inhouseMonthlyCost().total);
  });

  it("считает от переданной ставки, а не от зашитой", () => {
    expect(idleCost(3, 100_000)).toBe(300_000);
  });

  it("не уходит в минус", () => {
    expect(idleCost(-2)).toBe(0);
  });

  it("отпуск не выдуман: отработанных месяцев ровно на один меньше", () => {
    // Иначе на странице появится «платите за 12, работают 10»
    expect(PAID_MONTHS - WORKED_MONTHS).toBe(1);
  });
});

describe("тарифная лестница", () => {
  it("слоты идут подряд от одного до пяти", () => {
    expect(TARIFFS.map((t) => t.slots)).toEqual([1, 2, 3, 4, 5]);
  });

  it("цена растёт вместе со слотами", () => {
    // Тариф дороже при меньшем объёме - это ошибка ввода, а не скидка
    for (let i = 1; i < TARIFFS.length; i++) {
      expect(TARIFFS[i].price, TARIFFS[i].name).toBeGreaterThan(
        TARIFFS[i - 1].price,
      );
    }
  });

  it("слот дешевеет с каждой ступенью", () => {
    // На этом построен весь прайс: если где-то цена слота вырастет,
    // подпись «на N% дешевле входа» начнёт врать
    for (let i = 1; i < TARIFFS.length; i++) {
      expect(pricePerSlot(TARIFFS[i]), TARIFFS[i].name).toBeLessThan(
        pricePerSlot(TARIFFS[i - 1]),
      );
    }
  });

  it("цена слота это цена, делённая на слоты", () => {
    expect(pricePerSlot({ slots: 4, price: 215_000, name: "", title: "", note: "" })).toBe(53_750);
  });

  it("рекомендованный тариф ровно один", () => {
    expect(TARIFFS.filter((t) => t.recommended)).toHaveLength(1);
  });

  it("у каждого тарифа есть имя и пояснение", () => {
    for (const t of TARIFFS) {
      expect(t.name.length, String(t.slots)).toBeGreaterThan(0);
      expect(t.note.length, t.name).toBeGreaterThan(0);
    }
  });
});
