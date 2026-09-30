-- Версия ссылки на календарь: кнопка «Обновить ссылку» гасит прежние ссылки пользователя
ALTER TABLE "User" ADD COLUMN "calendarTokenVersion" INTEGER NOT NULL DEFAULT 0;
