import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Секрет второго фактора в базе.
 *
 * Если задан TOTP_ENCRYPTION_KEY (не короче 32 символов), секрет хранится
 * зашифрованным (AES-256-GCM), и утечка одной базы не даёт вечные коды.
 * Ключ отдельный, а не из AUTH_SECRET: смена AUTH_SECRET (она отзывает
 * сессии и ссылки календаря) иначе оставила бы всех с включённой 2FA без входа.
 *
 * В production без ключа секрет НЕ сохраняется вовсе — sealTotpSecret
 * бросает TotpKeyMissingError (раньше молча писал открытым текстом, а теперь
 * 2FA обязательна всему агентству, и открытыми были бы все секреты). Вне
 * production без ключа — прежнее поведение, открытым текстом: разработка
 * и тесты живут без ключа. Старые открытые значения читаются всегда.
 */
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim();
  return raw && raw.length >= 32 ? createHash("sha256").update(raw).digest() : null;
}

/** Ключ шифрования не задан (или короче 32 символов), а он обязателен. */
export class TotpKeyMissingError extends Error {
  constructor() {
    super("TOTP_ENCRYPTION_KEY не задан или короче 32 символов: секрет 2FA открытым текстом не сохраняется");
  }
}

export function sealTotpSecret(plain: string): string {
  const k = key();
  if (!k) {
    if (process.env.NODE_ENV === "production") throw new TotpKeyMissingError();
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** null — значение зашифровано, а ключа нет или он не подходит. */
export function openTotpSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) return null;
  try {
    const data = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", k, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Стоит ли пересохранить значение в зашифрованном виде. */
export function needsSealing(stored: string): boolean {
  return !stored.startsWith(PREFIX) && key() !== null;
}
