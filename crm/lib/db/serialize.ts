/**
 * Приведение того, что вернула Prisma, к виду, который переживёт
 * дорогу до браузера.
 *
 * Проблема одна: деньги и дробные числа Prisma отдаёт как Decimal —
 * объект с методами. React не умеет передавать такое из серверного
 * компонента в клиентский. В разработке это строчка в логе, которую
 * несложно пролистать, в собранном приложении — падение страницы.
 *
 * Почему общая функция, а не приведение поля за полем: Decimal есть
 * у вакансии, кандидата, договора, счёта и заявки, и каждое новое
 * денежное поле — новый шанс забыть. Забыть здесь дороже, чем
 * потратить обход объекта: выборки в кабинете небольшие, а цена
 * ошибки — белый экран у клиента.
 *
 * Точности double хватает: суммы вознаграждения и зарплаты далеко
 * от границ, где double начинает врать.
 */

/** Decimal определяем по устройству, а не по классу: генерация клиента
 * Prisma меняется от версии к версии, и сравнение с импортированным
 * классом однажды молча перестанет срабатывать. */
function isDecimal(value: object): boolean {
  return (
    "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function"
  );
}

/**
 * Тип результата: Decimal становится number на всю глубину.
 *
 * Без этого преобразование бессмысленно наполовину: значение
 * поменялось бы, а тип остался Decimal, и компилятор продолжал бы
 * пропускать его в клиентские компоненты.
 */
export type Plain<T> = T extends Date
  ? T
  : T extends { toNumber(): number }
    ? number
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

/**
 * Возвращает копию с Decimal, приведёнными к number.
 * Date, null и примитивы проходят как есть.
 */
export function plain<T>(value: T): Plain<T> {
  return convert(value) as Plain<T>;
}

function convert(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(convert);

  if (isDecimal(value)) return Number(value);

  // Прочие объекты со своим прототипом не трогаем: если такое
  // всплывёт, его поймает tests/serialization.test.ts, и разбираться
  // с ним надо осознанно, а не молча превращать во что попало
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = convert(item);
  }
  return result;
}
