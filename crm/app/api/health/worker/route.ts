import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { WORKER_ID, workerHealth } from "@/lib/monitoring/worker-heartbeat";

export const dynamic = "force-dynamic";

/**
 * Жив ли фоновый процесс (jobs/scheduler.ts) — для внешней проверки.
 *
 * 503, если удачного прохода не было дольше десяти минут: внешняя проверка
 * (infra/functions/uptime) считает живым всё, что не 5xx, и на 503 пишет
 * на ящик сбоев. Наружу — только «в порядке или нет» и минуты
 * с последнего прохода: ни имён, ни содержимого задач.
 */
export async function GET() {
  try {
    const row = await prisma.workerHeartbeat.findUnique({
      where: { id: WORKER_ID },
      select: { lastTickAt: true, lastOkAt: true },
    });
    const health = workerHealth(row);
    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  } catch (error) {
    console.error("[health/worker] база недоступна", error);
    return NextResponse.json(
      { ok: false, minutesSinceOk: null, reason: "база недоступна" },
      { status: 503 },
    );
  }
}
