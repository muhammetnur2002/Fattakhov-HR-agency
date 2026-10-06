import { z } from "zod";

import {
  newPasswordSchema,
  refinePasswordAgainstEmail,
} from "@/lib/validation/password";

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
}).superRefine(refinePasswordAgainstEmail);

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

/** Пустую строку из формы приводим к undefined — иначе в базу лягут "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v.replace(/\s/g, "")) : undefined))
  .refine((v) => v === undefined || (Number.isFinite(v) && v > 0), {
    message: "Проверьте вилку зарплаты",
  });

/**
 * Анкета после регистрации — /onboarding, по одному вопросу на экран,
 * одинаковая для обоих способов регистрации: телефон и почта.
 *
 * Подписи и порядок — из правок формы регистрации в CRM агентства
 * (24.09.2026): «ФИО», «Ваша должность» (не «Должность» — ниже есть
 * должность вакансии).
 *
 * Телефон и почта здесь необязательны схемой, но не по смыслу: телефон
 * агентству нужен всегда, только у вошедших по номеру он уже проверен
 * (User.phoneVerified), а у зарегистрированных по почте — назван на первом
 * экране регистрации; сервис это проверяет сам. Почта — для тех, у кого
 * вместо неё заглушка (вход по телефону).
 */
export const briefSchema = z
  .object({
    company: z
      .string()
      .trim()
      .min(2, "Укажите название компании")
      .max(200, "Слишком длинное название"),
    name: z
      .string()
      .trim()
      .min(2, "Укажите ФИО")
      .max(200, "Слишком длинное ФИО"),
    position: optionalText(200),
    phone: optionalText(50),
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.toLowerCase() : undefined))
      .refine((v) => v === undefined || z.email().safeParse(v).success, {
        message: "Проверьте адрес почты",
      }),
    vacancyTitle: z
      .string()
      .trim()
      .min(2, "Напишите, кого ищете")
      .max(200, "Слишком длинное название должности"),
    city: optionalText(120),
    salaryFrom: optionalMoney,
    salaryTo: optionalMoney,
  })
  .refine(
    (v) =>
      v.salaryFrom === undefined ||
      v.salaryTo === undefined ||
      v.salaryFrom <= v.salaryTo,
    { message: "Нижняя граница вилки больше верхней", path: ["salaryTo"] },
  );

export type BriefInput = z.infer<typeof briefSchema>;

/** Рабочая почта из настроек — для вошедших по телефону. */
export const workEmailSchema = z
  .email("Проверьте адрес почты")
  .transform((value) => value.trim().toLowerCase());
