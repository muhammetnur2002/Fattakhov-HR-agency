/*
  Warnings:

  - Added the required column `consentAt` to the `PendingClientRegistration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consentVersion` to the `PendingClientRegistration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PendingClientRegistration" ADD COLUMN     "consentAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "consentVersion" TEXT NOT NULL;
