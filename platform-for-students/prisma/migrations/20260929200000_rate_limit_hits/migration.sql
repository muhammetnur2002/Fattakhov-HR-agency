-- Общий счётчик попыток для ограничителя частоты (без Redis)
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitHit_key_at_idx" ON "RateLimitHit"("key", "at");

CREATE INDEX "RateLimitHit_at_idx" ON "RateLimitHit"("at");
