import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Подписанные ссылки на файлы (BR-37).
 *
 * Прямой доступ к хранилищу закрыт, файл отдаётся только по ссылке
 * с подписью и сроком жизни. Смысл в том, что ссылка на резюме,
 * пересланная или попавшая в историю браузера, перестаёт работать
 * через 15 минут, а не живёт вечно.
 */

/** Срок жизни ссылки. Достаточно, чтобы открыть файл, мало, чтобы им делиться. */
const DEFAULT_TTL_SECONDS = 15 * 60;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET не задан — нечем подписывать ссылки");
  return value;
}

function sign(key: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`${key}:${expiresAt}`)
    .digest("base64url");
}

export function buildSignedUrl(
  storageKey: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = sign(storageKey, expiresAt);

  const params = new URLSearchParams({
    key: storageKey,
    exp: String(expiresAt),
    sig: signature,
  });

  return `/api/files?${params.toString()}`;
}

export function verifySignedUrl(params: {
  key: string;
  exp: string;
  sig: string;
}): boolean {
  const expiresAt = Number(params.exp);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = sign(params.key, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(params.sig);

  // Длины сравниваем отдельно: timingSafeEqual бросает на разной длине
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
