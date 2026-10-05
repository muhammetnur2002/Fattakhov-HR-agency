-- «В сети» и «был(а) последний раз». Два столбца в существующей таблице.
--
-- Данные не трогает: lastSeenAt пуст у всех (до первого пульса человек
-- показывается как «был(а) давно»), showPresence включён по умолчанию —
-- статус показывают, пока его не выключили в настройках.
ALTER TABLE "Account" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "Account" ADD COLUMN "showPresence" BOOLEAN NOT NULL DEFAULT true;
