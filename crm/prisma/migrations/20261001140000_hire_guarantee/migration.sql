-- Гарантийный случай (BR-10): нанятый ушёл в гарантийный срок — дата ухода
-- уже есть (guaranteeBrokenAt), к ней причина и комментарий. Замена по
-- гарантии помечается ссылкой на исходный найм и в счёт не попадает.
-- Все колонки пустые: накат безопасен на живой базе.

-- CreateEnum
CREATE TYPE "GuaranteeBreakReason" AS ENUM ('CANDIDATE_LEFT', 'DISMISSED', 'PROBATION_FAILED', 'OTHER');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "guaranteeBreakComment" TEXT,
ADD COLUMN     "guaranteeBreakReason" "GuaranteeBreakReason",
ADD COLUMN     "replacementForId" TEXT;
