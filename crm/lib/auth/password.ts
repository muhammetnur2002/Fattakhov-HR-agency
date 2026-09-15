import { hash, verify } from "@node-rs/argon2";

/**
 * Параметры argon2id (ТЗ 13.2).
 * Ориентир OWASP: 19 МБ памяти, 2 итерации, параллелизм 1.
 * Память — главный параметр стойкости к перебору на GPU.
 */
const OPTIONS = {
  memoryCost: 19456, // КиБ
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Проверка пароля. Возвращает false на любой некорректный хеш вместо броска,
 * чтобы битая запись в БД не превращалась в 500 на форме входа.
 */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
