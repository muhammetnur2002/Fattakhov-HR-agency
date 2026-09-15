import { z } from "zod";

import { newPasswordSchema } from "@/lib/validation/password";

/**
 * Приём приглашения.
 *
 * Пароль проверяется тем же правилом, что смена и сброс
 * (newPasswordSchema). Здесь было своё, слабее: восемь символов без
 * проверки на очевидность. Получалось наоборот к смыслу — единственное
 * место, где пароль задаётся впервые и человеком, ещё не знакомым
 * с платформой, было и самым снисходительным: «password», «12345678»
 * и «qwerty12» проходили. При смене того же пароля они уже отвергались,
 * то есть завести учётку со слабым паролем было можно, а оставить его
 * при смене — нет.
 */
export const acceptInviteSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Укажите имя и фамилию")
      .max(120, "Слишком длинное имя"),
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/**
 * Свои данные в настройках: имя, телефон, должность.
 *
 * Почта и роль сюда не входят намеренно — почта завязана на вход
 * и приглашения, роль назначает агентство, а не сам человек.
 */
export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Укажите имя и фамилию")
    .max(120, "Слишком длинное имя"),
  // Пустая строка от незаполненного поля — это «убрать телефон», а не ошибка
  phone: z
    .string()
    .trim()
    .max(20, "Слишком длинный номер")
    .optional()
    .or(z.literal("")),
  position: z
    .string()
    .trim()
    .max(120, "Слишком длинное значение")
    .optional()
    .or(z.literal("")),
});

export type ProfileInput = z.infer<typeof profileSchema>;
