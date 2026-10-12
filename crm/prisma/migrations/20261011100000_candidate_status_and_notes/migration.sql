-- Рабочий статус кандидата в общей базе (ставится вручную) и заметки команды
-- по кандидату в целом. Только добавления: прежние данные и поля не меняются.

CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CLIENT', 'RESERVE', 'HIRED', 'NOT_RELEVANT', 'ON_HOLD');

ALTER TABLE "Candidate" ADD COLUMN "status" "CandidateStatus";
CREATE INDEX "Candidate_organizationId_status_idx" ON "Candidate"("organizationId", "status");

ALTER TABLE "Comment" ADD COLUMN "candidateId" TEXT;
CREATE INDEX "Comment_candidateId_createdAt_idx" ON "Comment"("candidateId", "createdAt");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
