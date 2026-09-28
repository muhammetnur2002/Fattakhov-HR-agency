import { z } from "zod";

import { newPasswordSchema } from "@/lib/validation/password";

/**
 * Телефон компании. Формы принимаются разные (с +7, с 8, с пробелами
 * и скобками), а хранится и уходит в письмо одна нормальная запись.
 */
export const companyPhoneSchema = z
  .string()
  .trim()
  .min(1, "Введите телефон")
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => /^(\+7|7|8)\d{10}$/.test(v), "Проверьте номер телефона")
  .transform((v) => `+7${v.replace(/^(\+7|7|8)/, "")}`);

function checkbox(message: string) {
  // Чекбокс шлёт "on" при отметке и вовсе пропадает из формы, когда снят —
  // отсюда required_error на отсутствующее поле и refine на его значение.
  return z
    .string({ error: message })
    .refine((v) => v === "on", { message });
}

/** Первый экран: контакты компании, пароль, согласие. */
export const companyRegisterSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите почту")
    .email("Проверьте адрес почты"),
  phone: companyPhoneSchema,
  password: newPasswordSchema,
  consent: checkbox("Подтвердите согласие на обработку данных"),
});

export type CompanyRegisterInput = z.infer<typeof companyRegisterSchema>;

/** Второй экран: код из письма. Контакты и пароль приходят от первого экрана. */
export const companyRegisterConfirmSchema = z.object({
  email: z.string().trim().email(),
  phone: companyPhoneSchema,
  password: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Код — шесть цифр из письма"),
});

export type CompanyRegisterConfirmInput = z.infer<
  typeof companyRegisterConfirmSchema
>;
