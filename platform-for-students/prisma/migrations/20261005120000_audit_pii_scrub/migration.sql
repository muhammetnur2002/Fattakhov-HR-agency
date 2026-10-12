-- Журнал аудита без ФИО и с индексом для «не чаще раза в 10 минут».
--
-- Подпись актора раньше была «РОЛЬ:ФИО»; теперь — «РОЛЬ:accountId» (lib/security/audit-log.ts).
-- Здесь то же самое делается для уже записанного:
--   1) записи живых аккаунтов получают подпись «РОЛЬ:accountId»; имя в админке подтягивается из аккаунта;
--   2) записи, у которых аккаунт уже удалён (accountId обнулён схемой), теряют подпись, IP и user-agent —
--      остаются действие, объект и время. Это необратимо: ФИО из журнала назад не вернуть.
-- Повторный запуск ничего не меняет.

CREATE INDEX IF NOT EXISTS "AuditLog_entityId_createdAt_idx" ON "AuditLog"("entityId", "createdAt");

UPDATE "AuditLog" AS l
SET "actorLabel" = a."role"::text || ':' || a."id"
FROM "Account" AS a
WHERE l."accountId" = a."id"
  AND l."actorLabel" ~ '^(STUDENT|EMPLOYER|ADMIN):'
  AND l."actorLabel" <> a."role"::text || ':' || a."id";

UPDATE "AuditLog"
SET "actorLabel" = 'DELETED', "ip" = NULL, "userAgent" = NULL
WHERE "accountId" IS NULL
  AND "actorLabel" ~ '^(STUDENT|EMPLOYER|ADMIN):';
