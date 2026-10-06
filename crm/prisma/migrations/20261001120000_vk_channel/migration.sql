-- Канал ВКонтакте (перенесено из CRM агентства): числовой id страницы
-- человека и отметка отправки уведомления в ВК. Ниже — ровно то, что
-- выдаёт `prisma migrate diff` для этих двух полей.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "sentVkAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vkUserId" TEXT;
