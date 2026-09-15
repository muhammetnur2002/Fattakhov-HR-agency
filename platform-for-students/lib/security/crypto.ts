import 'server-only';
import crypto from 'node:crypto';

/**
 * Шифрование персональных данных (ФИО, телефон, e-mail) в покое.
 *
 * AES-256-GCM: помимо конфиденциальности даёт аутентификацию — подменённый
 * шифротекст не расшифруется, а упадёт. Для БД это важнее скорости: строка,
 * которую кто-то поправил руками в psql, обязана обнаружиться.
 *
 * Из одного мастер-ключа через HKDF выводятся два подключа: для шифрования
 * и для слепого индекса. Один секрет в окружении, но ключи разного
 * назначения не переиспользуются — иначе HMAC по e-mail утекал бы в тот же
 * материал, что и шифрование.
 */

const VERSION = 'v1';
const IV_BYTES = 12; // рекомендованный размер nonce для GCM
const DEV_MASTER = 'fattakhov-dev-master-key-do-not-use-in-production';

let cached: { enc: Buffer; idx: Buffer } | null = null;

function masterKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    // Принимаем и hex, и base64 — что удобнее в конкретном деплое
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length >= 32) return b64.subarray(0, 32);
    return crypto.createHash('sha256').update(raw).digest();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PII_ENCRYPTION_KEY не задан. Сгенерируйте ключ: npm run keys',
    );
  }
  // Локальная разработка без секретов: детерминированный ключ, чтобы
  // база, засеянная вчера, читалась сегодня.
  return crypto.createHash('sha256').update(DEV_MASTER).digest();
}

function keys() {
  if (!cached) {
    const master = masterKey();
    cached = {
      enc: Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'pii-encryption', 32)),
      idx: Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'pii-blind-index', 32)),
    };
  }
  return cached;
}

/** Шифрует строку. Формат: v1.<iv>.<tag>.<ciphertext>, всё base64url. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys().enc, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Повреждённый шифротекст: неизвестный формат');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keys().enc,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Расшифровка, которая не роняет страницу из-за одной битой строки. */
export function decryptSafe(payload: string | null | undefined, fallback = ''): string {
  if (!payload) return fallback;
  try {
    return decrypt(payload);
  } catch {
    return fallback;
  }
}

/**
 * Слепой индекс: детерминированный HMAC для поиска по зашифрованному полю.
 * Найти пользователя по e-mail можно, перебрать базу — нет: без ключа
 * значение не восстанавливается, а без соли по словарю не подбирается.
 */
export function blindIndex(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac('sha256', keys().idx).update(normalized).digest('hex');
}

/** Криптостойкий код доступа для работодателя: 4 группы по 4 символа. */
export function generateAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих 0/O, 1/I
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim().toUpperCase()).digest('hex');
}

/** Сравнение за постоянное время — чтобы длина совпадения не утекала по таймингу. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
