import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Одноразовые коды по времени (TOTP, RFC 6238).
 *
 * Написано здесь, а не взято пакетом, сознательно: алгоритм занимает
 * полсотни строк, целиком описан стандартом и проверяется его же
 * официальными векторами (см. tests/totp.test.ts). Тянуть ради этого
 * зависимость в контур аутентификации значит доверять коду, который
 * никто из нас не читал.
 *
 * Параметры взяты стандартные, потому что их понимают все приложения:
 * SHA-1, 6 цифр, шаг 30 секунд. SHA-1 здесь не слабое место: он
 * используется в HMAC, где известные атаки на коллизии неприменимы,
 * и другие варианты половина приложений просто не поддерживает.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;

/**
 * Допуск в один шаг в каждую сторону.
 *
 * Часы на телефоне почти всегда чуть расходятся с сервером, а человек
 * успевает нажать «войти» на границе интервала. Без допуска это даёт
 * поток жалоб «код не подходит», с допуском больше двух окно перебора
 * растёт без пользы.
 */
const WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Секрет в base32 без выравнивания: в таком виде его ждут приложения. */
export function encodeBase32(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function decodeBase32(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Недопустимый символ base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** Новый секрет. 20 байт — размер, рекомендованный RFC 4226 для SHA-1. */
export function generateSecret(): string {
  return encodeBase32(randomBytes(20));
}

/**
 * Код по счётчику (HOTP, RFC 4226).
 *
 * Отдельно от TOTP, потому что именно на нём заданы тестовые векторы:
 * так проверяется сама арифметика, без привязки к часам.
 */
export function hotp(
  secret: Buffer,
  counter: number,
  digits = DIGITS,
): string {
  const buffer = Buffer.alloc(8);
  // Счётчик 64-битный, но BigInt здесь лишний: до переполнения 32 бит
  // при шаге в 30 секунд остаётся больше четырёх тысяч лет
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", secret).update(buffer).digest();

  // Динамическое усечение: младшие 4 бита последнего байта задают,
  // откуда брать четыре байта результата
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Код на заданный момент. По умолчанию — на сейчас. */
export function totp(
  secretBase32: string,
  atSeconds = Math.floor(Date.now() / 1000),
  digits = DIGITS,
): string {
  const counter = Math.floor(atSeconds / STEP_SECONDS);
  return hotp(decodeBase32(secretBase32), counter, digits);
}

/**
 * Проверка кода с допуском по времени.
 *
 * Сравнение постоянным временем: разница в скорости ответа на «первая
 * цифра не та» и «пять цифр совпали» подсказывает перебору направление.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(atSeconds / STEP_SECONDS);

  let matched = false;
  for (let shift = -WINDOW; shift <= WINDOW; shift += 1) {
    const expected = hotp(secret, counter + shift);
    // Без ранних выходов: цикл всегда проходит целиком, иначе время
    // ответа выдаёт, на каком шаге совпало
    if (safeEqual(expected, clean)) matched = true;
  }
  return matched;
}

/** Ссылка для приложения-аутентификатора. */
export function otpauthUrl(params: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${params.issuer}:${params.account}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
