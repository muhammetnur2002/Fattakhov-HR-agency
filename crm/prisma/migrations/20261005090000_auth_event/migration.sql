-- Журнал входов в CRM (решение владельца 05.10.2026).
--
-- Новые тип и таблица, существующие данные не меняются. Хранится 90 дней:
-- очистку делает фоновая задача (jobs/tasks.ts). Почта — только отпечаток
-- (HMAC), userId без внешнего ключа: запись не должна мешать удалению
-- учётной записи. IF NOT EXISTS: миграцию можно накатить повторно.

DO $$
BEGIN
  CREATE TYPE "AuthEventKind" AS ENUM ('LOGIN_OK', 'LOGIN_FAIL', 'TWO_FACTOR_FAIL', 'PASSWORD_RESET', 'TWO_FACTOR_ENABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AuthEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "AuthEventKind" NOT NULL,
    "userId" TEXT,
    "emailHash" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt");
