-- CreateTable
CREATE TABLE "VkMessageSeen" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkMessageSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VkMessageSeen_at_idx" ON "VkMessageSeen"("at");

-- CreateIndex
CREATE UNIQUE INDEX "VkMessageSeen_peerId_messageId_key" ON "VkMessageSeen"("peerId", "messageId");
