/**
 * Расчёт стоимости своей команды найма и тарифная лестница.
 *
 * Это заявление о деньгах на публичной странице: его будут проверять
 * калькулятором, и первым это сделает финансовый директор клиента.
 * Поэтому проверяется не «функция что-то вернула», а сама арифметика,
 * то, что в неё не затесался НДФЛ, и то, что на страницы не вернулись
 * готовые цифры, которые никто не подтверждал.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENTRY_TARIFF,
  GENERAL_CONTRIBUTIONS_RATE,
  INHOUSE_ROLES,
  PAID_MONTHS,
  TARIFFS,
  TOP_TARIFF,
  WORKED_MONTHS,
  inhouseMonthlyCost,
  pricePerSlot,
  savingsPercent,
} from "@/lib/marketing/inhouse-cost";

describe("стоимость своей команды по введённым цифрам", () => {
  // Цифры здесь тестовые: у самой функции своих чисел нет
  const ОКЛАДЫ = [200_000, 130_000, 70_000];

  it("складывает оклады, взносы и инструменты", () => {
    const r = inhouseMonthlyCost(ОКЛАДЫ, 0.3, 70_000);

    expect(r.salaries).toBe(400_000);
    expect(r.contributions).toBe(120_000);
    expect(r.tools).toBe(70_000);
    expect(r.total).toBe(590_000);
  });

  it("итог равен сумме частей, а не отдельному числу", () => {
    const r = inhouseMonthlyCost(ОКЛАДЫ, 0.3, 70_000);
    // Иначе на странице появится красивая цифра, не связанная с разбивкой
    expect(r.total).toBe(r.salaries + r.contributions + r.tools);
  });

  it("взносы считаются от окладов, а не от итога", () => {
    const r = inhouseMonthlyCost(ОКЛАДЫ, 0.15, 70_000);
    expect(r.contributions).toBe(Math.round(r.salaries * 0.15));
  });

  it("НДФЛ не прибавляется к расходам работодателя", () => {
    const r = inhouseMonthlyCost(ОКЛАДЫ, GENERAL_CONTRIBUTIONS_RATE, 70_000);
    // Налог удерживается из оклада, а не сверх него. Прибавить его -
    // типичная ошибка, на которой такие расчёты и ловят
    const сОшибкой =
      r.salaries * (1 + GENERAL_CONTRIBUTIONS_RATE + 0.13) + r.tools;
    expect(r.total).toBeLessThan(сОшибкой);
  });

  it("без своих параметров берёт общий тариф взносов и нулевые инструменты", () => {
    const r = inhouseMonthlyCost([100_000]);
    expect(r.contributions).toBe(100_000 * GENERAL_CONTRIBUTIONS_RATE);
    expect(r.tools).toBe(0);
    expect(r.total).toBe(130_000);
  });

  it("на пустом списке окладов нет ни одной «типичной» суммы", () => {
    // У функции нет своих чисел: без окладов посетителя она ничего не выдумывает
    const r = inhouseMonthlyCost([]);
    expect(r).toEqual({ salaries: 0, contributions: 0, tools: 0, total: 0 });
  });

  it("подчиняется своим параметрам, а не зашитым числам", () => {
    expect(inhouseMonthlyCost([100_000], 0.15, 0).total).toBe(115_000);
  });
});

describe("роли своего отдела", () => {
  it("описаны названием и делом, но не окладом", () => {
    // Оклад у каждой компании свой, и называет его посетитель. Вернуть
    // сюда готовое число значит вернуть на страницу непроверенный расчёт
    for (const role of INHOUSE_ROLES) {
      expect(Object.keys(role).sort(), role.role).toEqual(["note", "role"]);
      expect(role.role.length, role.role).toBeGreaterThan(0);
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

describe("отпуск", () => {
  it("не выдуман: отработанных месяцев ровно на один меньше", () => {
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

  it("на самом большом тарифе слот вдвое дешевле входа", () => {
    // На этом стоит цифра первого экрана и слова в прайсе: «дешевеет вдвое».
    // Поменяются цены, и слова придётся править вместе с ними
    expect(pricePerSlot(TOP_TARIFF) * 2).toBe(pricePerSlot(ENTRY_TARIFF));
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

describe("публичные страницы без неподтверждённых чисел", () => {
  /*
    Итоги расчёта, который держался на окладах, взносах и инструментах,
    названных от имени агентства без подтверждения бухгалтера: стоимость
    «своего отдела» и «сколько остаётся за год». Они попадали на первый
    экран, в описания для поисковиков и превью, в разметку FAQ.

    Ищем в исходниках целиком, а не в отрисованных страницах: описания
    и разметка живут в metadata и JSON-LD, а не в тексте экрана, и именно
    оттуда цифра однажды и вернётся. Пробел в числе бывает обычный,
    неразрывный и узкий неразрывный (Intl даёт их в разных средах),
    а в исходнике ещё и подчёркивание.

    Вернуть такое число можно, но только с подтверждением бухгалтера
    и указанием источника, и тогда этот тест правят вместе с ним.
  */
  const РАЗДЕЛИТЕЛЬ = String.raw`[\s  _]?`;
  const ЗАПРЕЩЕНО: [string, RegExp][] = [
    ["стоимость своего отдела", new RegExp(`590${РАЗДЕЛИТЕЛЬ}000`)],
    ["экономия за год", new RegExp(`4${РАЗДЕЛИТЕЛЬ}980${РАЗДЕЛИТЕЛЬ}000`)],
  ];
  const КАТАЛОГИ = ["app", "components", "lib"];

  function sources(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f) && !f.includes("generated"))
      .map((f) => join(dir, f));
  }

  it("нет готовой стоимости отдела ни в разметке, ни в описаниях, ни в FAQ", () => {
    const найдено: string[] = [];

    for (const dir of КАТАЛОГИ) {
      for (const file of sources(dir)) {
        const text = readFileSync(file, "utf8");
        for (const [что, re] of ЗАПРЕЩЕНО) {
          if (re.test(text)) найдено.push(`${file}: ${что}`);
        }
      }
    }

    expect(найдено).toEqual([]);
  });
});
