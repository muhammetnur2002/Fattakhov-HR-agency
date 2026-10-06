-- Быстрый вход и регистрация по телефону (SMS) и через Telegram, подтверждение
-- почты ссылкой, анкета после регистрации (перенесено из CRM агентства).

-- Самостоятельная регистрация и анкета после входа
ALTER TABLE "Client" ADD COLUMN     "briefCompletedAt" TIMESTAMP(3),
ADD COLUMN     "selfRegisteredAt" TIMESTAMP(3);

-- Заявка во «Входящих» — доказательство согласия при регистрации; после
-- анкеты в неё дописываются компания и вакансия
ALTER TABLE "Lead" ADD COLUMN     "clientId" TEXT;

-- Проверенные личности для входа (подпись Telegram, код из SMS) и почта,
-- ждущая подтверждения по ссылке
ALTER TABLE "User" ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "phoneVerified" TEXT,
ADD COLUMN     "telegramUserId" TEXT;

-- Коды из SMS: только HMAC, попытки и срок — у самого кода
CREATE TABLE "PhoneCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneCode_phone_createdAt_idx" ON "PhoneCode"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_clientId_idx" ON "Lead"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneVerified_key" ON "User"("phoneVerified");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Компании, заведённые до этой миграции, анкету не проходят: заведённые
-- агентством — потому что их данные вносит агентство, зарегистрированные
-- сами по почте — по решению не спрашивать тех, кто уже работает
-- в кабинете. selfRegisteredAt у них и так пуст, отметка — вторая страховка:
-- без неё любая будущая правка, проставившая selfRegisteredAt задним числом,
-- открыла бы анкету всем прежним клиентам разом.
UPDATE "Client" SET "briefCompletedAt" = "createdAt"
WHERE "briefCompletedAt" IS NULL;
