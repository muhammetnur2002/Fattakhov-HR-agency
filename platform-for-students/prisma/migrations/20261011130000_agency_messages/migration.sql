-- Переписка студента с агентством (сотрудники и владелец из CRM).
-- Только новая таблица: существующие данные и переписка с работодателями не затрагиваются.
CREATE TYPE "AgencyMessageAuthor" AS ENUM ('STUDENT', 'AGENCY');

CREATE TABLE "AgencyMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "author" "AgencyMessageAuthor" NOT NULL,
    "staffName" TEXT,
    "bodyEnc" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgencyMessage_studentId_createdAt_idx" ON "AgencyMessage"("studentId", "createdAt");
CREATE INDEX "AgencyMessage_studentId_author_readAt_idx" ON "AgencyMessage"("studentId", "author", "readAt");

ALTER TABLE "AgencyMessage" ADD CONSTRAINT "AgencyMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
