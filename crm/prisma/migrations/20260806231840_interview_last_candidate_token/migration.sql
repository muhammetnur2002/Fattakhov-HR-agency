-- Токен публичной ссылки гасится в момент выбора времени, но кнопка
-- «добавить в календарь» на экране подтверждения им ещё пользуется.
-- Храним последний использованный, чтобы .ics отдавался кандидату
-- без входа в систему.
ALTER TABLE "Interview" ADD COLUMN "lastCandidateToken" TEXT;

CREATE UNIQUE INDEX "Interview_lastCandidateToken_key"
  ON "Interview"("lastCandidateToken");
