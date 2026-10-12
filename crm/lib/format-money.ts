/**
 * Деньги и числа с разрядами — одно место на весь продукт.
 *
 * Раньше сумму писали по-разному: у вилки вакансии было четыре форматтера («150 000–200 000 ₽»,
 * «150 000 – 200 000 ₽ на руки», «150000 – … ₽», «150 000–200 000 ₽» в модерации), а перед «₽» стоял
 * то неразрывный пробел, то обычный. Обычный даёт перенос строки между числом и знаком валюты:
 * «₽» оставался одиноким на следующей строке.
 *
 * Правила записи:
 * - разряды отделяются неразрывным пробелом, знак «₽» тоже стоит через неразрывный: сумма не рвётся;
 * - вилка пишется «от 150 000 до 200 000 ₽»: переносится только между «от …» и «до …»;
 * - одна граница — «от 150 000 ₽» или «до 200 000 ₽», одинаковые — просто «150 000 ₽».
 *
 * Использовать `Intl.NumberFormat` и `toLocaleString` для денег напрямую нельзя
 * (`tests/format-money.test.ts`): ICU в разных браузерах ставит между разрядами то U+00A0,
 * то узкий пробел U+202F, а здесь запись нормализуется.
 */

/** Неразрывный пробел. */
export const NBSP = "\u00A0";

const GROUPING = new Intl.NumberFormat("ru-RU");

/** Число с разрядами через неразрывный пробел: 1234567 → «1 234 567». */
export function formatNumber(value: number): string {
  // Разные версии ICU ставят между разрядами U+00A0 или U+202F (узкий) — сводим к одному
  return GROUPING.format(value).replace(/[\u00A0\u202F\u2009]/g, NBSP);
}

/** Сумма в рублях: «175 000 ₽», знак через неразрывный пробел. */
export function formatMoney(value: number): string {
  return `${formatNumber(value)}${NBSP}₽`;
}

/**
 * Число из того, что приходит из базы и форм: число, строка, `Decimal` (у него есть `toString`).
 * Пусто, нечисло, ноль и отрицательное — `null`: граница вилки, равная нулю или меньше, значит «не указана»
 * (в формах незаполненное поле приходит пустой строкой или нулём).
 */
export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".") : String(value);
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Вилка зарплаты: «от 150 000 до 200 000 ₽». `null`, если не задана ни одна граница.
 *
 * `gross` — приписывает «gross» или «на руки» (`undefined` — ничего). Границы принимают всё, что
 * понимает `toAmount`, поэтому вызывающему не нужно приводить `Decimal` и строки формы самому.
 */
export function formatSalaryRange(
  from: unknown,
  to: unknown,
  options: { gross?: boolean | null } = {},
): string | null {
  const a = toAmount(from);
  const b = toAmount(to);
  if (a === null && b === null) return null;

  let text: string;
  if (a !== null && b !== null && a !== b) {
    // Неразрывно «от 150 000» и «до 200 000 ₽»; между ними обычный пробел — единственное место переноса
    text = `от${NBSP}${formatNumber(a)} до${NBSP}${formatNumber(b)}${NBSP}₽`;
  } else if (a !== null && b === null) {
    text = `от${NBSP}${formatNumber(a)}${NBSP}₽`;
  } else if (a === null && b !== null) {
    text = `до${NBSP}${formatNumber(b)}${NBSP}₽`;
  } else {
    text = formatMoney((a ?? b) as number);
  }

  if (options.gross === true) return `${text} gross`;
  if (options.gross === false) return `${text} на руки`;
  return text;
}
