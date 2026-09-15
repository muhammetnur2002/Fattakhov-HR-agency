import { z } from "zod";

/**
 * Требования к паролю.
 *
 * Длина вместо набора символов. Правило «заглавная, цифра и спецсимвол»
 * даёт Parol123! у половины сотрудников: люди подгоняют пароль под
 * проверку минимальным изменением привычного. Длинная фраза и надёжнее,
 * и запоминается.
 */
const MIN_LENGTH = 10;

/**
 * Пароли, которые ломаются первым же перебором. Список короткий
 * намеренно: полноценная проверка по утечкам это внешний сервис,
 * а очевидные варианты стоит отсекать и без него.
 */
const OBVIOUS = new Set([
  "password",
  "parol",
  "пароль",
  "qwerty",
  "qwerty123",
  "123456",
  "1234567890",
  "iloveyou",
  "admin",
  "administrator",
  "welcome",
  "letmein",
]);

export const newPasswordSchema = z
  .string()
  .min(MIN_LENGTH, `Не короче ${MIN_LENGTH} символов`)
  .max(200, "Слишком длинный пароль")
  .refine((v) => !OBVIOUS.has(v.toLowerCase().trim()), {
    message: "Такой пароль подберут первым же перебором",
  })
  .refine((v) => new Set(v).size > 3, {
    message: "Слишком однообразный пароль",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    message: "Пароли не совпадают",
    path: ["newPasswordConfirm"],
  });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    message: "Пароли не совпадают",
    path: ["newPasswordConfirm"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите почту")
    .email("Проверьте адрес почты"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
