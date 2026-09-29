-- Последний принятый шаг одноразового кода: защита от повторного использования
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
