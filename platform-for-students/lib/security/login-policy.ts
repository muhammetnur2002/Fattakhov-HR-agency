import type { Role } from '@/lib/types';

/**
 * Кто входит на платформу паролем.
 *
 * Администратор платформы (роль ADMIN) входит только через CRM — билетом на /api/auth/crm.
 * Парольный вход для него закрыт: пароль от панели HR подбирался бы той же формой, что и
 * студенческий, мимо защиты CRM (двухфакторный вход, отключение сотрудника в одном месте).
 */
export function canSignInWithPassword(role: Role): boolean {
  return role !== 'ADMIN';
}

/**
 * Хеш, с которым форма входа сверяет введённый пароль. Для администратора — null: сверка
 * идёт с пустышкой, как для несуществующей почты, поэтому и отказ, и время ответа те же,
 * что при неверном пароле, и по ответу не отличить «это админ» от «такой почты нет».
 */
export function passwordHashForLogin(account: { role: Role; passwordHash: string | null } | null): string | null {
  if (!account || !canSignInWithPassword(account.role)) return null;
  return account.passwordHash;
}
