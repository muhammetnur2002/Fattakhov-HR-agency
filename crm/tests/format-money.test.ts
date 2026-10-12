/**
 * Деньги: одна запись на весь продукт (12.10.2026, сверка consistency-14).
 *
 * Было четыре форматтера вилки и «₽», который отрывался от суммы на новую строку. Тест держит
 * форму записи и закрывает дорогу к форматтерам «на месте»: `Intl.NumberFormat` и `toLocaleString`
 * вне `lib/format-money.ts` запрещены, как и обычный пробел между числом и знаком рубля.
 */
import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatNumber,
  formatSalaryRange,
  NBSP,
  toAmount,
} from "@/lib/format-money";
import { formatMoney as fromPricing, formatNumber as numberFromPricing } from "@/lib/pricing";
import { read, sources } from "./helpers/jsx-source";

describe("formatNumber и formatMoney", () => {
  it("разряды и знак рубля — через неразрывный пробел", () => {
    expect(formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatMoney(175000)).toBe(`175${NBSP}000${NBSP}₽`);
    expect(formatMoney(0)).toBe(`0${NBSP}₽`);
  });

  it("в записи нет ни одного обычного пробела: сумма не рвётся", () => {
    for (const value of [999, 1000, 12345, 175000, 4980000]) {
      expect(formatMoney(value)).not.toMatch(/ /);
    }
  });

  it("узкий пробел ICU сводится к неразрывному", () => {
    expect(formatNumber(1500)).not.toMatch(/[  ]/);
  });

  it("прежний адрес в pricing.ts отдаёт то же самое (чужие ветки не ломаются)", () => {
    expect(fromPricing(175000)).toBe(formatMoney(175000));
    expect(numberFromPricing(2500)).toBe(formatNumber(2500));
  });
});

describe("toAmount", () => {
  it("число, строка формы и Decimal-подобное приводятся; пусто, ноль и мусор — null", () => {
    expect(toAmount(150000)).toBe(150000);
    expect(toAmount("150 000")).toBe(150000);
    expect(toAmount("150000,5")).toBe(150000.5);
    expect(toAmount({ toString: () => "90000" })).toBe(90000);
    for (const empty of [null, undefined, "", "   ", 0, "0", -5, "abc", NaN]) expect(toAmount(empty)).toBeNull();
  });
});

describe("formatSalaryRange: вилка «от … до …» одним способом", () => {
  it("обе границы", () => {
    expect(formatSalaryRange(150000, 200000)).toBe(`от${NBSP}150${NBSP}000 до${NBSP}200${NBSP}000${NBSP}₽`);
  });

  it("единственное место, где строка может перенестись, — обычный пробел между «от …» и «до …»", () => {
    const text = formatSalaryRange(150000, 200000) as string;
    expect(text.match(/ /g)).toHaveLength(1);
  });

  it("одна граница — «от» или «до»; равные границы — одна сумма; пусто — null", () => {
    expect(formatSalaryRange(90000, null)).toBe(`от${NBSP}90${NBSP}000${NBSP}₽`);
    expect(formatSalaryRange(null, 120000)).toBe(`до${NBSP}120${NBSP}000${NBSP}₽`);
    expect(formatSalaryRange(100000, 100000)).toBe(`100${NBSP}000${NBSP}₽`);
    expect(formatSalaryRange(null, null)).toBeNull();
    expect(formatSalaryRange("", "")).toBeNull();
  });

  it("строки формы приводятся как есть: «150000» → «150 000»", () => {
    expect(formatSalaryRange("150000", "200000")).toBe(formatSalaryRange(150000, 200000));
  });

  it("gross и «на руки» приписываются, undefined — ничего", () => {
    expect(formatSalaryRange(100000, 120000, { gross: true })).toMatch(/\u00A0₽ gross$/);
    expect(formatSalaryRange(100000, 120000, { gross: false })).toMatch(/\u00A0₽ на руки$/);
    expect(formatSalaryRange(100000, 120000)).toMatch(/₽$/);
  });
});

describe("исходники: деньги пишутся только через lib/format-money.ts", () => {
  const files = [...sources("app"), ...sources("components")];
  const libFiles = ["lib/services/registration.ts", "lib/pricing.ts"];

  it("Intl.NumberFormat и toLocaleString — только в самом форматтере", () => {
    const offenders: string[] = [];
    for (const file of [...files, ...libFiles]) {
      // components/ui/calendar.tsx — заготовка выбора даты (названия месяцев), деньгами не занимается
      if (file === "components/ui/calendar.tsx") continue;
      if (/\bIntl\.NumberFormat\b|\.toLocaleString\(/.test(read(file))) offenders.push(file);
    }
    expect(offenders, "formatNumber, formatMoney или formatSalaryRange из @/lib/format-money").toEqual([]);
  });

  it("между суммой и «₽» не стоит обычный пробел: `{…} ₽` отрывает знак на новую строку", () => {
    const offenders: string[] = [];
    for (const file of [...files, ...libFiles]) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const m of text.matchAll(/[})] ₽/g)) {
        offenders.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, "сумма — formatMoney(), знак рубля к ней приклеен неразрывным пробелом").toEqual([]);
  });

  it("свои форматтеры вилки не заводят: функций formatSalary нет", () => {
    const offenders = files.filter((f) => /function formatSalary\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
