import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Секрет второго фактора в базе.
 *
 * Если задан TOTP_ENCRYPTION_KEY, секрет хранится зашифрованным (AES-256-GCM), и утечка одной
 * базы не даёт вечные коды. Ключ отдельный, а не из AUTH_SECRET: смена AUTH_SECRET (она отзывает
 * сессии и ссылки календаря) иначе оставила бы всех с включённой 2FA без входа.
 * Без ключа — прежнее поведение. Старые открытые значения читаются всегда.
 */
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim();
  return raw && raw.length >= 32 ? createHash("sha256").update(raw).digest() : null;
}

export function sealTotpSecret(plain: string): string {
  const k = key();
  if (!k) return plain;
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
