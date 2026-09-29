-- CreateEnum
CREATE TYPE "StudyLevel" AS ENUM ('BACHELOR', 'SPECIALIST', 'MASTER');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "studyLevel" "StudyLevel";

-- CreateTable
CREATE TABLE "StudentNotification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentNotification_studentId_createdAt_idx" ON "StudentNotification"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentNotification_studentId_readAt_idx" ON "StudentNotification"("studentId", "readAt");

-- AddForeignKey
ALTER TABLE "StudentNotification" ADD CONSTRAINT "StudentNotification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
