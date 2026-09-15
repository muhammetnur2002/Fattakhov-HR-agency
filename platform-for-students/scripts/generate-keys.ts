import crypto from 'node:crypto';

/**
 * Генерация секретов для .env.
 *
 * Отдельная команда, а не «придумайте строку»: ключ шифрования ПДн,
 * набранный руками, почти всегда оказывается словарным.
 */
const encryptionKey = crypto.randomBytes(32).toString('base64');
const jwtSecret = crypto.randomBytes(48).toString('base64url');

console.log(`
Ключи сгенерированы. Скопируйте в .env:

PII_ENCRYPTION_KEY="${encryptionKey}"
JWT_SECRET="${jwtSecret}"

Внимание:
  • PII_ENCRYPTION_KEY нельзя терять и нельзя менять на работающей базе —
    все зашифрованные поля станут нечитаемыми.
  • Смена JWT_SECRET немедленно завершает все активные сессии.
`);
