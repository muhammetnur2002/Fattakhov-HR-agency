import { prisma } from "@/lib/db/prisma";

/**
 * Отметка фонового процесса — «планировщик жив».
 *
 * Зачем. Письма, напоминания о встречах, просроченные счета и очередь
 * уничтожения ПДн живут в отдельном процессе (jobs/scheduler.ts). Если он
 * упал целиком или завис, сайт и кабинет продолжают открываться, внешняя
 * проверка «сайт жив» молчит, а reportFailure() не срабатывает: падать
 * нечему, проходов просто нет. Узнали бы по жалобе клиента, что не пришло
 * приглашение на интервью.
 *
 * Поэтому каждый проход обновляет одну строку WorkerHeartbeat, а
 * /api/health/worker отвечает 503, если удачного прохода давно не было.
 * Этот адрес опрашивает та же внешняя проверка (infra/monitoring.tf,
 * функция fhr-uptime) — и пишет на ящик сбоев.
 */

/** Имя процесса в WorkerHeartbeat.id — планировщик сейчас один. */
export const WORKER_ID = "scheduler";

/**
 * Через сколько без удачного прохода процесс считается вставшим.
 * Проход идёт раз в минуту и может длиться дольше; перезапуск при выкатке —
 * около минуты. Десять минут не дают ложных тревог и совпадают с шагом
 * внешней проверки.
 */
export const WORKER_STALE_AFTER_MS = 10 * 60_000;

export type WorkerHealth = {
  ok: boolean;
  /** Минут с последнего удачного прохода; null — удачных не было. */
  minutesSinceOk: number | null;
  /** Почему не в порядке — человеческим языком, для письма о сбое. */
  reason?: string;
};

/** Чистая проверка по строке отметки — без базы, чтобы её можно было тестировать. */
export function workerHealth(
  row: { lastTickAt: Date; lastOkAt: Date | null } | null,
  now: Date = new Date(),
): WorkerHealth {
  if (!row) {
    return {
      ok: false,
      minutesSinceOk: null,
      reason: "отметок нет: фоновый процесс не запускался",
    };
  }

  const minutesSinceOk = row.lastOkAt
    ? Math.floor((now.getTime() - row.lastOkAt.getTime()) / 60_000)
    : null;
  const okFresh =
    row.lastOkAt !== null &&
    now.getTime() - row.lastOkAt.getTime() <= WORKER_STALE_AFTER_MS;

  if (okFresh) return { ok: true, minutesSinceOk };

  // Отличаем «проходы идут, но падают» от «проходов нет вовсе»:
  // в первом случае смотреть письма о сбое планировщика, во втором — сам процесс
  const tickFresh =
    now.getTime() - row.lastTickAt.getTime() <= WORKER_STALE_AFTER_MS;
  return {
    ok: false,
    minutesSinceOk,
    reason: tickFresh
      ? "проходы идут, но падают — см. письма «Сбой: планировщик»"
      : "проходов нет: процесс остановлен или завис",
  };
}

/**
 * Записать проход. Не бросает: если база недоступна, отметка не нужна —
 * об этом и так скажут /api/health и сам планировщик.
 */
export async function recordWorkerTick(
  ok: boolean,
  now: Date = new Date(),
): Promise<void> {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { id: WORKER_ID },
      create: { id: WORKER_ID, lastTickAt: now, lastOkAt: ok ? now : null },
      update: ok ? { lastTickAt: now, lastOkAt: now } : { lastTickAt: now },
    });
  } catch (error) {
    console.error("[планировщик] отметка не записана", error);
  }
}
