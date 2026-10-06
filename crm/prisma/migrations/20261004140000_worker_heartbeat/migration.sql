-- Отметка фонового процесса (jobs/scheduler.ts) — для /api/health/worker
-- и внешней проверки: остановку планировщика иначе не видно никому.
-- Новая таблица, существующие данные не меняются.

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "lastTickAt" TIMESTAMP(3) NOT NULL,
    "lastOkAt" TIMESTAMP(3),

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
