-- Запрос клиента с договором на удаление аккаунта: подтверждает владелец агентства
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
