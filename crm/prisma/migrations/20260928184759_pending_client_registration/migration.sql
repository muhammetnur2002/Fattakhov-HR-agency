-- CreateTable
CREATE TABLE "PendingClientRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingClientRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingClientRegistration_email_createdAt_idx" ON "PendingClientRegistration"("email", "createdAt");
