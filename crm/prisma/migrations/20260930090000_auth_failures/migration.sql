-- Неудачные попытки входа: общий счётчик для блокировки перебора пароля и кода 2FA
CREATE TABLE "AuthFailure" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthFailure_key_at_idx" ON "AuthFailure"("key", "at");

CREATE INDEX "AuthFailure_at_idx" ON "AuthFailure"("at");
