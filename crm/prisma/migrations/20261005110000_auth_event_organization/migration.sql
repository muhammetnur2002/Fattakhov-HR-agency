-- Организация в событии журнала входов: владелец читает события своей
-- организации по индексу, а не выбирает всех её пользователей.
-- Колонка пустая у существующих строк и у событий по неизвестным адресам
-- (NULL), поэтому NOT NULL не нужен. IF NOT EXISTS: миграцию можно
-- накатить повторно.

ALTER TABLE "AuthEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "AuthEvent_organizationId_createdAt_idx" ON "AuthEvent"("organizationId", "createdAt");
