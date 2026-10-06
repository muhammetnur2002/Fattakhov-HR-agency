-- Черновики сообщений студентам (кабинет клиента, «Студенческая платформа»).
--
-- Одна строка на пару «пользователь CRM — отклик платформы»: поле ввода
-- беседы автосохраняется, пока сообщение не отправлено. Беседа без сообщений
-- попадает в список «Сообщения» только с непустым черновиком. Новая таблица,
-- существующие данные не меняются. Строки удаляются вместе с пользователем
-- (каскад) и при обезличивании аккаунта (lib/services/account-deletion.ts).

CREATE TABLE IF NOT EXISTS "StudentMessageDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentMessageDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentMessageDraft_userId_applicationId_key" ON "StudentMessageDraft"("userId", "applicationId");

CREATE INDEX IF NOT EXISTS "StudentMessageDraft_userId_updatedAt_idx" ON "StudentMessageDraft"("userId", "updatedAt");

DO $$
BEGIN
    ALTER TABLE "StudentMessageDraft" ADD CONSTRAINT "StudentMessageDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
