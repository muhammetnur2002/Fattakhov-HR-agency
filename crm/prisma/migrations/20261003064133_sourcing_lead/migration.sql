-- Сорсинг-лид (регламент юриста, lib/services/sourcing.ts): человек,
-- данные которого получены не от него, без согласия живёт 14 дней.

-- AlterEnum
ALTER TYPE "ErasureReason" ADD VALUE 'SOURCING_EXPIRED';

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "sourcedAt" TIMESTAMP(3),
ADD COLUMN     "sourcingNoticeAt" TIMESTAMP(3),
ADD COLUMN     "sourcingReminderAt" TIMESTAMP(3);

-- Кандидаты, которые уже в базе без согласия, входят в режим с момента
-- выкатки, а не задним числом: иначе первый же проход фоновой задачи
-- заблокировал бы их без предупреждения тем, кто с ними работает
UPDATE "Candidate"
SET "sourcedAt" = CURRENT_TIMESTAMP
WHERE "consentStatus" = 'PENDING'
  AND "erasureState" = 'ACTIVE'
  AND "deletedAt" IS NULL;
