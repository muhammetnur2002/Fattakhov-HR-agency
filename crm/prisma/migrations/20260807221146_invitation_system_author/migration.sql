-- Приглашение, созданное системой при первичной настройке, автора
-- не имеет: первого владельца звать некому, пользователей ещё нет.
ALTER TABLE "Invitation" ALTER COLUMN "createdById" DROP NOT NULL;
