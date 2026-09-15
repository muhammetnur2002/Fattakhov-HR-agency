/**
 * Во сколько обходится своя команда найма.
 *
 * Все числа собраны здесь, а не разбросаны по разметке: это заявление
 * о рынке, за которое агентство отвечает перед клиентом, и менять его
 * должно быть одно движение.
 *
 * ⚠️ Оклады и стоимость площадок - допущение до подтверждения Полиной.
 * Ставка взносов - тем более: она меняется законом, зависит от статуса
 * компании и от предельной базы. Перед показом живому клиенту сверить
 * с бухгалтером, иначе первый же финансовый директор разберёт расчёт
 * и разберёт вместе с ним доверие.
 */

export type Tariff = {
  slots: number;
  price: number;
  /** Имя тарифа с сайта агентства. */
  name: string;
  title: string;
  note: string;
  /** Что показываем как основное предложение. */
  recommended?: boolean;
};

/**
 * Тарифная лестница агентства.
 *
 * Цены и названия от двух до пяти слотов взяты с сайта агентства,
 * вход за один слот назван Полиной. Ничего не додумано: выдуманная
 * цена в прайсе хуже её отсутствия, потому что человек считает, что
 * посчитал, а он не посчитал.
 *
 * ⚠️ Имя тарифа на один слот («Старт») моё: на сайте лестница
 * начинается с двух. Остальные названия чужие, менять их нельзя.
 */
export const TARIFFS: Tariff[] = [
  {
    slots: 1,
    price: 100_000,
    name: "Старт",
    title: "Одна вакансия",
    note: "Точечный поиск, когда закрыть нужно одну позицию",
  },
  {
    slots: 2,
    price: 130_000,
    name: "Стандарт",
    title: "Две вакансии",
    note: "Точечное усиление найма",
  },
  {
    slots: 3,
    price: 175_000,
    name: "Развитие",
    title: "Три вакансии",
    note: "Стабильный параллельный найм",
    recommended: true,
  },
  {
    slots: 4,
    price: 215_000,
    name: "Бизнес",
    title: "Четыре вакансии",
    note: "Несколько команд или филиалов",
  },
  {
    slots: 5,
    price: 250_000,
    name: "Масштаб",
    title: "Пять вакансий",
    note: "Активный рост компании",
  },
];

/**
 * Во что обходится один слот на этом тарифе.
 *
 * Главный довод лестницы: слот дешевеет вдвое от первого к пятому.
 * Считается, а не пишется руками, иначе при правке цены строка
 * «за слот» останется от старой.
 */
export function pricePerSlot(tariff: Tariff): number {
  return Math.round(tariff.price / tariff.slots);
}

export const ENTRY_TARIFF = TARIFFS[0];

export const ENTRY_PRICE = ENTRY_TARIFF.price;

export const COMPARABLE_TARIFF =
  TARIFFS.find((t) => t.recommended) ?? TARIFFS[TARIFFS.length - 1];

export type CostRow = {
  role: string;
  /** Оклад до вычета НДФЛ, рублей в месяц. */
  salary: number;
  note: string;
};

export const INHOUSE_ROLES: CostRow[] = [
  {
    role: "HR-директор",
    salary: 200_000,
    note: "Стратегия найма, профили должностей, работа с руководителями",
  },
  {
    role: "HR-менеджер",
    salary: 130_000,
    note: "Процесс отбора, коммуникация, выход кандидата",
  },
  {
    role: "Рекрутер",
    salary: 70_000,
    note: "Поиск, первичные интервью, ведение воронки",
  },
];

/**
 * Страховые взносы работодателя.
 *
 * Это то, что компания платит сверх оклада. НДФЛ сюда не входит
 * намеренно: он удерживается из оклада, а не добавляется к нему,
 * и прибавлять его к расходам работодателя - типичная ошибка,
 * на которой такие расчёты и ловят.
 */
export const CONTRIBUTIONS_RATE = 0.3;

/** Площадки, инструменты, рабочее место. */
export const TOOLS_COST = 70_000;

export type CostBreakdown = {
  salaries: number;
  contributions: number;
  tools: number;
  total: number;
};

export function inhouseMonthlyCost(
  roles: CostRow[] = INHOUSE_ROLES,
  rate = CONTRIBUTIONS_RATE,
  tools = TOOLS_COST,
): CostBreakdown {
  const salaries = roles.reduce((sum, r) => sum + r.salary, 0);
  const contributions = Math.round(salaries * rate);

  return {
    salaries,
    contributions,
    tools,
    total: salaries + contributions + tools,
  };
}

/**
 * Насколько подписка дешевле, в процентах.
 *
 * Округляем вниз: заявлять «экономия 83%» при 83.4 честнее, чем
 * округлять вверх до 84.
 */
export function savingsPercent(inhouse: number, subscription: number): number {
  if (inhouse <= 0) return 0;
  return Math.floor(((inhouse - subscription) / inhouse) * 100);
}

/**
 * Сколько остаётся в компании за год.
 *
 * Главное число первого экрана. Процент абстрактен: «дешевле на 70%»
 * человек не примеряет ни на что. Годовая сумма примеряется на бюджет
 * сразу, потому что в этих единицах бюджет и обсуждают.
 *
 * Считается по сопоставимой конфигурации, а не по цене входа: иначе
 * это была бы разница между отделом и одним рекрутером.
 */
export function annualSavings(
  inhouseTotal: number = inhouseMonthlyCost().total,
  subscription: number = COMPARABLE_TARIFF.price,
): number {
  return Math.max((inhouseTotal - subscription) * 12, 0);
}

// ============ ЧЕГО НЕТ В ЭТИХ 590 000 ============

/**
 * Ежегодный оплачиваемый отпуск, календарных дней (ТК РФ, ст. 115).
 *
 * Отпускные не прибавляются к расходам: работодатель платит те же
 * двенадцать окладов. Меняется не сумма, а отдача - месяц из года
 * оплачен, но не отработан. Поэтому ниже считается не «доплата
 * за отпуск», а стоимость неотработанного месяца.
 */
export const VACATION_DAYS = 28;

/** Оплаченных месяцев в году. */
export const PAID_MONTHS = 12;

/** Отработанных: 28 календарных дней это примерно один месяц. */
export const WORKED_MONTHS = 11;

/**
 * Во что обходятся месяцы, за которые заплачено, но работы не было:
 * отпуск, простой между наборами, разгон нового сотрудника.
 */
export function idleCost(
  months: number,
  monthly: number = inhouseMonthlyCost().total,
): number {
  return Math.max(0, Math.round(months * monthly));
}
