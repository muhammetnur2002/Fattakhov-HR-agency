-- Задания сотрудников в календаре агентства. Новая таблица, прежние данные не затрагиваются.

CREATE TABLE "CalendarTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "vacancyId" TEXT,
    "candidateId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarTask_assigneeId_dueAt_idx" ON "CalendarTask"("assigneeId", "dueAt");
CREATE INDEX "CalendarTask_organizationId_dueAt_idx" ON "CalendarTask"("organizationId", "dueAt");
CREATE INDEX "CalendarTask_createdById_dueAt_idx" ON "CalendarTask"("createdById", "dueAt");
