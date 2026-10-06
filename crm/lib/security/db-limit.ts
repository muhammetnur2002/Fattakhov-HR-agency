import { prismaRaw as db } from "@/lib/db/prisma";

/**
 * Лимит в базе: общий для всех процессов и переживающий перезапуск.
 *
 * Счётчик в памяти (rate-limit.ts) на один адрес не годится: у каждого
 * процесса он свой и обнуляется с перезапуском. Здесь попытка записывается
 * строкой в AuthFailure — той же таблицей, что считает неудачные входы, —
 * а проверка и запись идут одной транзакцией под advisory-замком на ключ.
 * Замок — не украшение: без него два одновременных запроса оба видят
 * «занято четыре из пяти» и оба проходят (так и было, пока счётчики
 * читались отдельно от записи). С замком запросы по одному ключу
 * выстраиваются в очередь, и лимит точный.
 */

export type ReserveResult =
  | { allowed: true }
  /** reason: «window» — вышел лимит за окно, «gap» — слишком скоро после прошлой попытки. */
  | { allowed: false; retryAfter: number; reason: "window" | "gap" };

/**
 * Занять попытку по ключу.
 *
 * limit — сколько попыток за окно windowMs. minGapMs — пауза между
 * попытками (0 — без паузы). Отказ не записывается: запросы сверх
 * лимита не продлевают блокировку сами себе.
 */
export async function reserveAttempt(
  key: string,
  options: { limit: number; windowMs: number; minGapMs?: number },
): Promise<ReserveResult> {
  const now = Date.now();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    const recent = await tx.authFailure.findMany({
      where: { key, at: { gt: new Date(now - options.windowMs) } },
      orderBy: { at: "asc" },
      select: { at: true },
    });

    if (recent.length >= options.limit) {
      // Окно освободится, когда выйдет из него самая старая из занятых попыток
      const oldest = recent[recent.length - options.limit].at.getTime();
      return {
        allowed: false as const,
        reason: "window" as const,
        retryAfter: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
      };
    }

    const gap = options.minGapMs ?? 0;
    const last = recent.at(-1)?.at.getTime();
    if (gap > 0 && last !== undefined && now - last < gap) {
      return {
        allowed: false as const,
        reason: "gap" as const,
        retryAfter: Math.max(1, Math.ceil((last + gap - now) / 1000)),
      };
    }

    await tx.authFailure.create({ data: { key, at: new Date(now) } });
    return { allowed: true as const };
  });
}

/** Сколько попыток по ключу за окно. Для проверки и отображения, не для решений. */
export async function countAttempts(key: string, windowMs: number): Promise<number> {
  return db.authFailure.count({ where: { key, at: { gt: new Date(Date.now() - windowMs) } } });
}

/** Забыть попытки по ключам (успех сбрасывает счётчик). */
export async function clearAttempts(keys: string[]): Promise<void> {
  await db.authFailure.deleteMany({ where: { key: { in: keys } } });
}
