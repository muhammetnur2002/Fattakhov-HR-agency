-- Студенты студенческой платформы как кандидаты CRM: метка источника и ссылка
-- на студента. Только добавления, прежние данные не трогаются.
ALTER TYPE "CandidateSource" ADD VALUE 'STUDENT_PLATFORM';

ALTER TABLE "Candidate" ADD COLUMN "studentPlatformId" TEXT;

-- Один студент — один кандидат в организации (NULL в уникальности не считается)
CREATE UNIQUE INDEX "Candidate_organizationId_studentPlatformId_key" ON "Candidate"("organizationId", "studentPlatformId");
