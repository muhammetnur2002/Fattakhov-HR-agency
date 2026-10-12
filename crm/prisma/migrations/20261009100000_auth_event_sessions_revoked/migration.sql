-- Журнал входов: человек сам завершил все свои сессии («выйти на всех устройствах»)
ALTER TYPE "AuthEventKind" ADD VALUE 'SESSIONS_REVOKED';
