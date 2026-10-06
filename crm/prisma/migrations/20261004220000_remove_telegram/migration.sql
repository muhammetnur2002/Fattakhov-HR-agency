-- Telegram-бот убран из CRM целиком (решение владельца 04.10.2026):
-- остаётся только ВКонтакте. Уведомления в Telegram, привязка чата и вход
-- через виджет Telegram больше не существуют, их поля в базе не нужны.
--
-- Поле Candidate.telegram и значение TELEGRAM у источника кандидата — это
-- контакты людей, а не бот, их не трогаем.

-- Привязанный чат бота и проверенный Telegram-id для входа
ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramChatId";
DROP INDEX IF EXISTS "User_telegramUserId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramUserId";

-- Отметка «ушло в Telegram» у записи уведомления
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "sentTelegramAt";

-- Отложенные схлопыванием отправки в Telegram больше слать некому:
-- иначе в списке каналов остались бы мёртвые значения
UPDATE "Notification"
SET "pendingChannels" = array_remove("pendingChannels", 'telegram')
WHERE 'telegram' = ANY("pendingChannels");
