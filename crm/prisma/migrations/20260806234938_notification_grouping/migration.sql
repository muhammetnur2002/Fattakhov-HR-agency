-- Схлопывание уведомлений (BR-30): события с одним ключом в пределах
-- окна сводятся в одно сообщение вместо пяти писем подряд.
ALTER TABLE "Notification" ADD COLUMN "groupKey" TEXT;

-- Каналы, доставки в которые уведомление ещё ждёт. Пустой массив —
-- уведомление живёт только в интерфейсе.
ALTER TABLE "Notification"
  ADD COLUMN "pendingChannels" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Notification_userId_eventCode_groupKey_createdAt_idx"
  ON "Notification"("userId", "eventCode", "groupKey", "createdAt");
