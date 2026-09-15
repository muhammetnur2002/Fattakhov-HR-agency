/**
 * Чистая арифметика метрик (ТЗ 11.1).
 *
 * Отделено от запросов намеренно: конверсии и медианы легко посчитать
 * неправильно, и проверять это надо на числах, а не на данных из БД.
 */

/**
 * Конверсия между этапами в процентах.
 *
 * Ноль в знаменателе даёт null, а не ноль: «конверсия 0%» и «считать
 * не из чего» — разные вещи, и показывать их одинаково нельзя.
 */
export function conversion(from: number, to: number): number | null {
  if (from <= 0) return null;
  return Math.round((to / from) * 100);
}

/**
 * Медиана.
 *
 * Именно медиана, а не среднее: одна вакансия, закрывавшаяся полгода,
 * сдвигает среднее так, что оно перестаёт описывать реальность.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Календарные дни между моментами, вниз до целого. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export type FunnelStep = {
  code: string;
  name: string;
  /** Сколько кандидатов дошли до этого этапа хотя бы раз. */
  reached: number;
  /** Конверсия из предыдущего этапа. null на первом шаге. */
  conversionFromPrevious: number | null;
};

/**
 * Воронка-водопад.
 *
 * Считаем «дошёл хотя бы раз», а не «сейчас находится»: кандидат,
 * получивший оффер, давно не стоит на этапе «представлен», но через
 * представление он проходил. Иначе воронка показывала бы текущий
 * срез вместо пути.
 */
export function buildFunnel(
  steps: { code: string; name: string; order: number }[],
  reachedByCode: Map<string, number>,
): FunnelStep[] {
  const ordered = [...steps].sort((a, b) => a.order - b.order);

  return ordered.map((step, index) => {
    const reached = reachedByCode.get(step.code) ?? 0;
    const previous =
      index === 0 ? null : (reachedByCode.get(ordered[index - 1].code) ?? 0);

    return {
      code: step.code,
      name: step.name,
      reached,
      conversionFromPrevious:
        previous === null ? null : conversion(previous, reached),
    };
  });
}

/**
 * Доля представленных, дошедших до интервью, — главная метрика качества
 * подбора (ТЗ 11.2).
 *
 * Если она низкая, рекрутер заваливает клиента нерелевантными людьми,
 * и это видно раньше, чем клиент начнёт жаловаться.
 */
export function presentationQuality(
  presented: number,
  reachedInterview: number,
): number | null {
  return conversion(presented, reachedInterview);
}
