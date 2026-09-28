"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  confirmCompanyRegistration,
  requestCompanyRegistration,
  RegistrationError,
} from "@/lib/services/registration";
import {
  companyRegisterConfirmSchema,
  companyRegisterSchema,
} from "@/lib/validation/registration";

export type RegisterState = {
  error?: string;
  /** Экран 1 пройден, письмо с кодом ушло — форма показывает поле кода. */
  sent?: boolean;
};

function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  );
}

async function clientIp(): Promise<string | null> {
  const head = await headers();
  return head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Экран 1: контакты и пароль — код уходит на почту. */
export async function requestCompanyRegistrationAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = companyRegisterSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    await requestCompanyRegistration({
      email: parsed.data.email,
      phone: parsed.data.phone,
      password: parsed.data.password,
      ip: await clientIp(),
    });
  } catch (error) {
    if (error instanceof RegistrationError) return { error: error.message };
    throw error;
  }

  return { sent: true };
}

/**
 * Экран 2: код из письма. Пароль приходит от экрана 1 через состояние
 * формы в браузере, а не из базы — он нужен здесь только на один вызов
 * signIn ниже, второй раз хешировать его незачем.
 */
export async function confirmCompanyRegistrationAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = companyRegisterConfirmSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте код" };
  }

  try {
    await confirmCompanyRegistration({
      email: parsed.data.email,
      code: parsed.data.code,
    });
  } catch (error) {
    if (error instanceof RegistrationError) return { error: error.message };
    throw error;
  }

  // Сразу входим под созданным пользователем — тот же приём, что и
  // при приёме приглашения (см. app/(public)/invite/[token]/actions.ts)
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Компания зарегистрирована, но войти не удалось. Попробуйте войти вручную.",
      };
    }
    throw error;
  }
}
