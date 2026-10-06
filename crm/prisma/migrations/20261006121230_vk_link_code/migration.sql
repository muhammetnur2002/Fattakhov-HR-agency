-- CreateTable
CREATE TABLE "VkLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VkLinkCode_userId_idx" ON "VkLinkCode"("userId");

-- CreateIndex
CREATE INDEX "VkLinkCode_codeHash_idx" ON "VkLinkCode"("codeHash");
