-- Форма согласия на обработку ПДн по публичной ссылке (BR-33).
-- Версия текста хранится вместе с фактом: если текст изменится,
-- должно быть видно, под чем именно стоит согласие человека.
ALTER TABLE "Candidate" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "consentToken" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "consentTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Candidate_consentToken_key" ON "Candidate"("consentToken");
