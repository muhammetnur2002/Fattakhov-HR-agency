import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Токен приглашения в базе.
 *
 * Ссылка приглашения — это вход в кабинет с указанной ролью, поэтому в базе
 * открытым текстом её держать нельзя: утечка одной базы давала бы рабочие
 * ссылки, пока они не истекли (семь дней).
 *
 * Хранится два значения:
 *  - tokenHash — sha256, по нему ссылка ищется. Токен — 32 случайных байта,
 *    подбирать его бессмысленно, медленный хеш здесь не нужен (так же
 *    устроен сброс пароля, lib/services/passwords.ts);
 *  - tokenEnc — токен, зашифрованный AES-256-GCM, — чтобы команда могла
 *    скопировать ссылку позже из списка «Ждут принятия». Без ключа базы его
 *    не прочитать.
 *
 * Ключ тот же, что у секрета 2FA (TOTP_ENCRYPTION_KEY, он обязателен в
 * production), но производный: у приглашений своя «соль», и значение,
 * зашифрованное для одного назначения, не расшифровывается как другое.
 * Без ключа в production tokenEnc не сохраняется вовсе: ссылку видно один
 * раз при создании и в письме, а повторно скопировать её нельзя. Это лучше,
 * чем хранить её открытой. Вне production без ключа — открытым текстом
 * с пометкой: разработка и тесты живут без ключа.
 *
 * Модуль без зависимостей от приложения: его читают и скрипты запуска.
 */
const PREFIX = "enc:v1:";
const PLAIN_PREFIX = "dev:";

function key(): Buffer | null {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim();
  return raw && raw.length >= 32
    ? createHash("sha256").update(`invite-token:v1:${raw}`).digest()
    : null;
}

export function inviteTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Что записать в базу для нового токена: хеш для поиска и шифр для показа. */
export function inviteTokenColumns(token: string): { tokenHash: string; tokenEnc: string | null } {
  return { tokenHash: inviteTokenHash(token), tokenEnc: sealInviteToken(token) };
}

export function sealInviteToken(token: string): string | null {
  const k = key();
  if (!k) return process.env.NODE_ENV === "production" ? null : PLAIN_PREFIX + token;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * Токен для показа. Берётся из шифра; у приглашений, созданных до перехода
 * на хеши, — из прежнего открытого поля. null — показать нечего (ключа нет,
 * он сменился или значение не сохранялось).
 */
export function openInviteToken(row: { tokenEnc: string | null; token: string | null }): string | null {
  const stored = row.tokenEnc;
  if (stored?.startsWith(PLAIN_PREFIX) && process.env.NODE_ENV !== "production") {
    return stored.slice(PLAIN_PREFIX.length);
  }
  if (stored?.startsWith(PREFIX)) {
    const k = key();
    if (!k) return row.token;
    try {
      const data = Buffer.from(stored.slice(PREFIX.length), "base64url");
      const decipher = createDecipheriv("aes-256-gcm", k, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      return row.token;
    }
  }
  return row.token;
}
