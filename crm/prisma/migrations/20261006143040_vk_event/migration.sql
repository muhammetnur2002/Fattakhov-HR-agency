-- CreateTable
CREATE TABLE "VkEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "vkErrorCode" INTEGER,

    CONSTRAINT "VkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VkEvent_at_idx" ON "VkEvent"("at");
