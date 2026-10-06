-- Контур уничтожения персональных данных (ст. 21 152-ФЗ): состояние
-- кандидата, основание и сроки. Все существующие кандидаты получают
-- ACTIVE; блокирует тех, у кого согласие отозвано или истекло, первый
-- же проход фоновой задачи (runErasureQueue) — со сроком 30 дней от него.

-- CreateEnum
CREATE TYPE "ErasureState" AS ENUM ('ACTIVE', 'BLOCKED_FOR_ERASURE', 'ERASURE_PENDING', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "ErasureReason" AS ENUM ('CONSENT_REVOKED', 'CONSENT_EXPIRED', 'SUBJECT_REQUEST', 'PURPOSE_ACHIEVED');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "erasedAt" TIMESTAMP(3),
ADD COLUMN     "erasureDueAt" TIMESTAMP(3),
ADD COLUMN     "erasureReason" "ErasureReason",
ADD COLUMN     "erasureRequestedAt" TIMESTAMP(3),
ADD COLUMN     "erasureState" "ErasureState" NOT NULL DEFAULT 'ACTIVE';

