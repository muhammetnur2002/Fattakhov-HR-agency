import bcrypt from 'bcrypt';

/**
 * bcrypt с cost 12: ~250 мс на современном ядре. Дешевле — и офлайн-перебор
 * украденной базы становится реалистичным; дороже — и форма входа начинает
 * ощущаться сломанной.
 *
 * Нативный `bcrypt`, а не чистый JS `bcryptjs`: тот считает хеш в главном
 * потоке Node, и пока идёт пачка входов, остальные запросы стоят в очереди
 * (на стенде медиана остальных запросов вырастала с 33 мс до 8 с). Нативный
 * модуль считает в пуле потоков libuv и не блокирует цикл событий. Формат
 * хешей тот же ($2a$/$2b$), поэтому уже сохранённые пароли проверяются без
 * изменений (tests/unit.ts). Модуль нативный — в бандл не попадает
 * (serverExternalPackages в next.config.mjs).
 */
const COST = 12;

/** Настоящий хеш случайной строки: сравнение с ним занимает столько же, сколько с чужим паролем. */
const DUMMY_HASH = '$2a$12$e6rBJ3M3PEXR2QgdFWwUSu5YecljlsvazDMXY7cIGpKKebj2s6Wwy';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Аккаунта без пароля не существует, но сравнение всё равно выполняем:
    // мгновенный отказ отличал бы «нет такого пользователя» от «неверный пароль».
    return bcrypt.compare(plain, DUMMY_HASH);
  }
  return bcrypt.compare(plain, hash);
}
