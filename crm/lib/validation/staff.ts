import { z } from "zod";

import { STAFF_GRANTS, STAFF_ROLES } from "@/lib/access";
import {
  newPasswordSchema,
  refinePasswordAgainstEmail,
} from "@/lib/validation/password";

/** Должность — свободный текст: «Администратор», «Руководитель отдела». Пустое — нет должности. */
const position = z
  .string()
  .trim()
  .max(120, "Должность — не длиннее 120 символов")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/*
  «Не выбрана» и «не из списка» — разные ошибки, и текст у них разный.

  Одна фраза «Выберите роль» на всё подряд отвечала человеку, который
  роль выбрал, — просто чужую. Роль «не из списка» здесь почти всегда
  клиентская, и это не опечатка: сотрудник агентства с ролью кабинета
  клиента — не полусотрудник, а пользователь, которого фильтры видимости
  считают чужим. Владельца в списке нет по другой причине: его не
  назначают, он появляется при первичной настройке (STAFF_ROLES).
  Внутренних кодов в тексте нет ни в одном случае — действие показывает
  первое сообщение разбора дословно.
*/
const role = z.enum(STAFF_ROLES, {
  error: (issue) => {
    if (!issue.input) return "Выберите роль";
    if (issue.input === "OWNER") {
      return "Роль владельца не выдаётся — выберите из списка";
    }
    return "Эта роль не для сотрудников агентства — выберите из списка";
  },
});

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
  .superRefine(refinePasswordAgainstEmail)
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

/**
 * Приглашение сотрудника по ссылке из письма — рядом с созданием аккаунта,
 * а не вместо него. Пароль здесь человек задаёт сам, поэтому его в форме
 * нет; роль, должность и доступы те же и переходят в учётную запись при
 * приёме приглашения (acceptInvitation).
 */
export const inviteStaffSchema = z.object({
  email: z.email("Проверьте адрес почты").transform((v) => v.toLowerCase().trim()),
  role,
  position,
  grants,
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
