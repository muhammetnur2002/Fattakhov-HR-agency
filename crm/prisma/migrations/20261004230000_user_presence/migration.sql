-- «В сети» и «был(а) последний раз» (решение владельца 04.10.2026).
--
-- lastSeenAt — пульс открытой вкладки кабинета (не чаще раза в минуту);
-- showPresence — переключатель «Показывать, что я в сети»: при false статус
-- никому не виден, а сам пульс не записывается. Новые колонки, существующие
-- данные не меняются; у всех текущих пользователей статус по умолчанию
-- включён, а время последнего захода неизвестно (NULL) до первого пульса.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showPresence" BOOLEAN NOT NULL DEFAULT true;
