-- Календарь с задачами: описание, длительность, дедлайн, напоминание, повторения.
-- Только добавление: прежние колонки и данные не затрагиваются. Начало задачи
-- по-прежнему лежит в "dueAt", прежние задания остаются заданиями с дедлайном.

ALTER TABLE "CalendarTask"
    ADD COLUMN "description" TEXT,
    ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "hasDeadline" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "remindBeforeMinutes" INTEGER DEFAULT 60,
    ADD COLUMN "recurrenceRule" TEXT,
    ADD COLUMN "recurrenceUntil" TIMESTAMP(3);

-- Прежние задания поставлены себе, если постановщик и исполнитель совпадают
UPDATE "CalendarTask" SET "isPersonal" = ("assigneeId" = "createdById");

CREATE INDEX "CalendarTask_hasDeadline_completedAt_dueAt_idx" ON "CalendarTask"("hasDeadline", "completedAt", "dueAt");

CREATE TABLE "CalendarTaskException" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "movedToStartsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarTaskException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarTaskException_taskId_occurrenceDate_key" ON "CalendarTaskException"("taskId", "occurrenceDate");

ALTER TABLE "CalendarTaskException" ADD CONSTRAINT "CalendarTaskException_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CalendarTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
