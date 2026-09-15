/**
 * Тарифные модели и расчёт вознаграждения (ТЗ 12.1).
 *
 * Чистые функции без обращения к БД — чтобы считать одинаково и на экране
 * онбординга (живой калькулятор), и при выставлении счёта, и в тестах.
 *
 * BR-31: вознаграждение по закрытой вакансии считается от ФАКТИЧЕСКОГО
 * оффера (`Application.offerSalary`), а не от вилки в брифе. Функции здесь
 * принимают оклад параметром — передавать нужный источник обязан вызывающий.
 */
import type { PricingModel } from "@/lib/generated/prisma/enums";

/** Параметры договора, влияющие на расчёт. Какие поля заполнены — зависит от модели. */
export type PricingParams = {
  pricingModel: PricingModel;
  /** % от годового дохода — только для PERCENT_ANNUAL. */
  percentRate?: number | null;
  /** Сколько окладов — только для PERCENT_MONTHLY. */
  monthsCount?: number | null;
  /** Фикс за закрытие — FIXED_PER_HIRE. */
  fixedAmount?: number | null;
  /** Абонплата за месяц — SUBSCRIPTION. */
  subscriptionAmount?: number | null;
  /** Сколько вакансий в работе одновременно — SUBSCRIPTION. */
  subscriptionSlots?: number | null;
  /** Ставка в час — HOURLY. */
  hourlyRate?: number | null;
};

export type SalaryContext = {
  /** Месячный оклад кандидата, ₽. */
  monthlySalary: number;
  /** Годовой бонус, ₽. Входит в базу для PERCENT_ANNUAL (ТЗ 12.1). */
  annualBonus?: number;
};

/**
 * Стоимость одного закрытия.
 *
 * Возвращает null для моделей, где «цена за найм» не определена:
 * абонентская плата и почасовая не привязаны к факту закрытия.
 */
export function feePerHire(
  params: PricingParams,
  salary: SalaryContext,
): number | null {
  const { monthlySalary, annualBonus = 0 } = salary;

  switch (params.pricingModel) {
    case "PERCENT_ANNUAL": {
      const rate = params.percentRate ?? 0;
      const annualIncome = monthlySalary * 12 + annualBonus;
      return round(annualIncome * (rate / 100));
    }

    case "PERCENT_MONTHLY": {
      // Модель «N окладов»: процент здесь не участвует, несмотря на название.
      const months = params.monthsCount ?? 0;
      return round(monthlySalary * months);
    }

    case "FIXED_PER_HIRE":
      return round(params.fixedAmount ?? 0);

    case "SUBSCRIPTION":
    case "HOURLY":
      return null;
  }
}

/** Стоимость месяца работы. Определена только для абонентской модели. */
export function monthlyCost(params: PricingParams): number | null {
  if (params.pricingModel !== "SUBSCRIPTION") return null;
  return round(params.subscriptionAmount ?? 0);
}

/** Стоимость по почасовой модели. */
export function hourlyCost(params: PricingParams, hours: number): number | null {
  if (params.pricingModel !== "HOURLY") return null;
  return round((params.hourlyRate ?? 0) * hours);
}

/**
 * При скольких закрытиях в месяц абонентская плата выгоднее разовой оплаты.
 *
 * Это главный аргумент в разговоре о подписке: клиенту нужно видеть не
 * «150 000 в месяц», а «выгодно начиная с двух закрытий».
 * Возвращает null, если сравнивать не с чем.
 */
export function subscriptionBreakEven(
  subscriptionMonthly: number,
  comparablePerHireFee: number | null,
): number | null {
  if (!comparablePerHireFee || comparablePerHireFee <= 0) return null;
  if (subscriptionMonthly <= 0) return null;
  return Math.ceil(subscriptionMonthly / comparablePerHireFee);
}

/** Размер предоплаты по договору. */
export function prepaymentAmount(total: number, prepaymentPercent: number): number {
  return round(total * (prepaymentPercent / 100));
}

function round(value: number): number {
  return Math.round(value);
}

// ============ ПРЕСЕТЫ ДЛЯ ОНБОРДИНГА ============

export type TariffPreset = PricingParams & {
  key: string;
  title: string;
  /** Кому подходит — короткая строка для карточки выбора. */
  bestFor: string;
  guaranteeDays: number;
  prepaymentPercent: number;
  paymentTerms: string;
};

/**
 * ⚠️ СТАВКИ — ДОПУЩЕНИЕ, НЕ СОГЛАСОВАНЫ С ЗАКАЗЧИКОМ.
 *
 * Взяты как правдоподобные для российского рынка подбора, чтобы экран
 * онбординга работал на реальных числах. Перед показом живому клиенту
 * заменить на фактические тарифы агентства (открытый вопрос 1 раздела 19 ТЗ).
 *
 * Менять здесь: экран онбординга и калькулятор строятся из этого списка,
 * править разметку не нужно.
 */
export const TARIFF_PRESETS: TariffPreset[] = [
  {
    key: "monthly_2",
    title: "Два оклада кандидата",
    bestFor: "Стандартный вариант для специалистов и линейных руководителей",
    pricingModel: "PERCENT_MONTHLY",
    monthsCount: 2,
    guaranteeDays: 90,
    prepaymentPercent: 0,
    paymentTerms: "Оплата по факту выхода кандидата на работу",
  },
  {
    key: "annual_15",
    title: "15% от годового дохода",
    bestFor: "Руководители и дорогие специалисты с бонусной частью",
    pricingModel: "PERCENT_ANNUAL",
    percentRate: 15,
    guaranteeDays: 90,
    prepaymentPercent: 30,
    paymentTerms: "30% предоплата при старте работ, 70% при выходе кандидата",
  },
  {
    key: "fixed_80k",
    title: "Фиксированная стоимость",
    bestFor: "Массовые и повторяющиеся позиции с понятной вилкой",
    pricingModel: "FIXED_PER_HIRE",
    fixedAmount: 80_000,
    guaranteeDays: 60,
    prepaymentPercent: 0,
    paymentTerms: "Оплата по факту выхода кандидата на работу",
  },
  // Абонентская лестница целиком, цены с сайта агентства. Держать её
  // здесь и в lib/marketing/inhouse-cost порознь нельзя: калькулятор
  // онбординга и прайс на сайте обязаны показывать одно и то же.
  {
    key: "subscription_1",
    title: "Старт: одна вакансия",
    bestFor: "Точечный поиск, когда закрыть нужно одну позицию",
    pricingModel: "SUBSCRIPTION",
    subscriptionAmount: 100000,
    subscriptionSlots: 1,
    guaranteeDays: 90,
    prepaymentPercent: 100,
    paymentTerms: "Предоплата за календарный месяц, минимальный срок 3 месяца",
  },
  {
    key: "subscription_2",
    title: "Стандарт: две вакансии",
    bestFor: "Точечное усиление найма",
    pricingModel: "SUBSCRIPTION",
    subscriptionAmount: 130000,
    subscriptionSlots: 2,
    guaranteeDays: 90,
    prepaymentPercent: 100,
    paymentTerms: "Предоплата за календарный месяц, минимальный срок 3 месяца",
  },
  {
    key: "subscription_3",
    title: "Развитие: три вакансии",
    bestFor: "Стабильный параллельный найм",
    pricingModel: "SUBSCRIPTION",
    subscriptionAmount: 175000,
    subscriptionSlots: 3,
    guaranteeDays: 90,
    prepaymentPercent: 100,
    paymentTerms: "Предоплата за календарный месяц, минимальный срок 3 месяца",
  },
  {
    key: "subscription_4",
    title: "Бизнес: четыре вакансии",
    bestFor: "Несколько команд или филиалов",
    pricingModel: "SUBSCRIPTION",
    subscriptionAmount: 215000,
    subscriptionSlots: 4,
    guaranteeDays: 90,
    prepaymentPercent: 100,
    paymentTerms: "Предоплата за календарный месяц, минимальный срок 3 месяца",
  },
  {
    key: "subscription_5",
    title: "Масштаб: пять вакансий",
    bestFor: "Активный рост компании",
    pricingModel: "SUBSCRIPTION",
    subscriptionAmount: 250000,
    subscriptionSlots: 5,
    guaranteeDays: 90,
    prepaymentPercent: 100,
    paymentTerms: "Предоплата за календарный месяц, минимальный срок 3 месяца",
  },
];

export function findPreset(key: string): TariffPreset | undefined {
  return TARIFF_PRESETS.find((p) => p.key === key);
}

/** Человекочитаемое описание условий — для карточки договора. */
export function describePricing(params: PricingParams): string {
  switch (params.pricingModel) {
    case "PERCENT_ANNUAL":
      return `${formatNumber(params.percentRate ?? 0)}% от годового дохода кандидата`;
    case "PERCENT_MONTHLY":
      return `${params.monthsCount ?? 0} ${pluralOklad(params.monthsCount ?? 0)} кандидата`;
    case "FIXED_PER_HIRE":
      return `${formatMoney(params.fixedAmount ?? 0)} за закрытую позицию`;
    case "SUBSCRIPTION":
      return `${formatMoney(params.subscriptionAmount ?? 0)} в месяц, до ${params.subscriptionSlots ?? 0} вакансий одновременно`;
    case "HOURLY":
      return `${formatMoney(params.hourlyRate ?? 0)} в час`;
  }
}

function pluralOklad(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "оклад";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "оклада";
  return "окладов";
}

export function formatMoney(value: number): string {
  // Неразрывный пробел перед ₽ — иначе сумма может перенестись
  // на новую строку между числом и знаком валюты
  return `${formatNumber(value)} ₽`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}
