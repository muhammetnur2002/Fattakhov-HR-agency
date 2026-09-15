import { z } from "zod";

import { STAFF_GRANTS, STAFF_ROLES } from "@/lib/access";
import { newPasswordSchema } from "@/lib/validation/password";

/** Должность — свободный текст: «Администратор», «Руководитель отдела». Пустое — нет должности. */
const position = z
  .string()
  .trim()
  .max(120, "Должность — не длиннее 120 символов")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const role = z.enum(STAFF_ROLES, "Выберите роль");

/** Неизвестный код доступа — ошибка, а не молча выброшенное значение. */
const grants = z.array(z.enum(STAFF_GRANTS, "Неизвестный доступ")).default([]);

const fullName = z
  .string()
  .trim()
  .min(2, "Укажите имя и фамилию")
  .max(120, "Не длиннее 120 символов");

/**
 * Создание аккаунта сотрудника. Пароль задаёт владелец (или тот, кому
 * доверено управление командой) и сообщает его человеку лично — ссылки
 * приглашения здесь нет, вход возможен сразу.
 */
export const createStaffSchema = z
  .object({
    email: z.email("Проверьте адрес почты").transform((v) => v.toLowerCase().trim()),
    fullName,
    password: newPasswordSchema,
    passwordConfirm: z.string(),
    role,
    position,
    grants,
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  userId: z.string().min(1, "Сотрудник не найден"),
  role,
  position,
  grants,
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

/** Владелец перевыдаёт пароль сотруднику, который его забыл. */
export const resetStaffPasswordSchema = z
  .object({
    userId: z.string().min(1, "Сотрудник не найден"),
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
