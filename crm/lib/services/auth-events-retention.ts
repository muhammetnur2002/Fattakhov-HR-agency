import { prismaRaw as db } from "@/lib/db/prisma";

/**
 * Срок хранения журнала входов и его очистка.
 *
 * Отдельно от auth-events.ts намеренно: тот читает заголовки запроса
 * (next/headers), а очистку зовёт фоновая задача (jobs/tasks.ts) — отдельный
 * процесс под tsx, где запросов нет и Next ни к чему. Здесь только база.
 */

/** Сколько хранится запись. */
export const AUTH_EVENT_RETENTION_DAYS = 90;

/**
 * Очистка по сроку хранения. Вместе с ней — старые строки счётчика
 * неудачных входов: они нужны на пятнадцать минут, а копились до первого
 * случайного прохода (login-throttle.ts), которого может и не быть.
 * Возвращает число удалённых событий журнала.
 */
export async function purgeAuthLogs(now: Date = new Date()): Promise<number> {
  const { count } = await db.authEvent.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - AUTH_EVENT_RETENTION_DAYS * 86_400_000) } },
  });
  await db.authFailure.deleteMany({
    where: { at: { lt: new Date(now.getTime() - 24 * 3_600_000) } },
  });
  return count;
}
