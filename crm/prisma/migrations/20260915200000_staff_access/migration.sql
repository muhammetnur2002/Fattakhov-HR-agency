-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "grants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "grants" TEXT[] DEFAULT ARRAY[]::TEXT[];
