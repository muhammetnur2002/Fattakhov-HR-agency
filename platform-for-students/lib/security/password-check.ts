import { ZodError } from 'zod';
import { passwordProblem } from '@/lib/password-policy';
import { isCommonPassword } from './common-passwords';

/**
 * Полная проверка нового пароля на сервере: правила из lib/password-policy.ts
 * плюс словарь распространённых паролей.
 *
 * Схема в lib/validation.ts в браузере проверяет всё, кроме словаря; здесь
 * пароль доходит до проверки со словарём — в тех местах, где он реально
 * задаётся (регистрация, сброс по ссылке, служебные команды). Новое место,
 * где задаётся пароль, обязано пройти через эту функцию.
 */
export function weakPasswordMessage(password: string, email: string | null | undefined): string | null {
  return passwordProblem(password, { email, isCommon: isCommonPassword });
}

/** То же, но как ошибка валидации поля `password`: `handle()` превратит её в 400 с подсветкой поля. */
export function assertStrongPassword(password: string, email: string | null | undefined): void {
  const message = weakPasswordMessage(password, email);
  if (message) throw new ZodError([{ code: 'custom', path: ['password'], message }]);
}
