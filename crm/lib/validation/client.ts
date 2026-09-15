import { z } from "zod";

import { newPasswordSchema } from "@/lib/validation/password";

/** Пустую строку из формы приводим к undefined — иначе в БД лягут "" вместо NULL. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/**
 * ИНН: 10 знаков у юрлица, 12 у ИП. Контрольные суммы не считаем —
 * для карточки клиента достаточно отсеять опечатки в длине и буквы.
 */
const innSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^(\d{10}|\d{12})$/.test(v), {
    message: "ИНН — 10 цифр у компании или 12 у ИП",
  });

export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Укажите название компании")
    .max(200, "Слишком длинное название"),
  legalName: optionalText(300),
  inn: innSchema,
  industry: optionalText(120),
  city: optionalText(120),
  website: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v === undefined || /^https?:\/\/.+\..+/.test(v), {
      message: "Ссылка должна начинаться с http:// или https://",
    }),
  // Идёт рекрутеру в работу: чем продавать вакансию кандидату
  description: optionalText(4000),
  accountManagerId: optionalText(40),
});

export type ClientInput = z.infer<typeof clientSchema>;

export const inviteUserSchema = z.object({
  email: z.email("Проверьте адрес почты").transform((v) => v.toLowerCase().trim()),
  role: z.enum(["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"]),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
 * Аккаунт пользователя клиента, который заводит агентство. Пароль задаёт
 * аккаунт-менеджер и сообщает его человеку лично — без ссылки-приглашения.
 * Коллегу внутри своей же компании клиент по-прежнему зовёт ссылкой
 * (app/(client)/settings/actions.ts, inviteUserSchema) — там нет второй
 * стороны, которая могла бы передать пароль лично.
 */
export const createClientUserSchema = z
  .object({
    email: z.email("Проверьте адрес почты").transform((v) => v.toLowerCase().trim()),
    fullName: z
      .string()
      .trim()
      .min(2, "Укажите имя и фамилию")
      .max(120, "Не длиннее 120 символов"),
    password: newPasswordSchema,
    passwordConfirm: z.string(),
    role: z.enum(["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"]),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type CreateClientUserInput = z.infer<typeof createClientUserSchema>;

export const resetClientUserPasswordSchema = z
  .object({
    userId: z.string().min(1, "Пользователь не найден"),
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type ResetClientUserPasswordInput = z.infer<typeof resetClientUserPasswordSchema>;

export const acceptTariffSchema = z.object({
  presetKey: z.string().min(1, "Выберите условия сотрудничества"),
});
