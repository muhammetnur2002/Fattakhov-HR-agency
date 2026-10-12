-- Токен приглашения больше не хранится открытым текстом: поиск по sha256,
-- для показа ссылки команде — шифр под ключом приложения.

ALTER TABLE "Invitation" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "Invitation" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "tokenEnc" TEXT;

-- Действующие приглашения остаются рабочими: их хеш считается из открытого токена
UPDATE "Invitation"
SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" IS NOT NULL;

-- Принятые и истёкшие ссылки не нужны никому: открытое значение стирается сразу
UPDATE "Invitation"
SET "token" = NULL
WHERE "acceptedAt" IS NOT NULL OR "expiresAt" <= now();

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
