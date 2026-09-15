import bcrypt from 'bcryptjs';

/**
 * bcrypt с cost 12: ~250 мс на современном ядре. Дешевле — и офлайн-перебор
 * украденной базы становится реалистичным; дороже — и форма входа начинает
 * ощущаться сломанной.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Аккаунта без пароля не существует, но сравнение всё равно выполняем:
    // мгновенный отказ отличал бы «нет такого пользователя» от «неверный пароль».
    return bcrypt.compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
  }
  return bcrypt.compare(plain, hash);
}
