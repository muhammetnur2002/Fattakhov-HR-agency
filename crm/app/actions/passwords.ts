"use server";

import { headers } from "next/headers";

import { requireActor } from "@/lib/auth/session";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  changePassword,
  PasswordError,
  requestPasswordReset,
  resetPassword,
} from "@/lib/services/passwords";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/password";

export type PasswordState = { error?: string; ok?: string; sent?: boolean };

function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  );
}

async function clientIp(): Promise<string | null> {
  const head = await headers();
  return head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Смена пароля вошедшим пользователем. */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const actor = await requireActor();

  // Ограничение частоты и здесь: перебор текущего пароля через эту форму
  // ничем не отличается от перебора через форму входа
  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    await changePassword({
      userId: actor.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
  } catch (error) {
    if (error instanceof PasswordError) return { error: error.message };
    throw error;
  }

  return {
    ok: "Пароль изменён. На других устройствах вход придётся выполнить заново.",
  };
}

/**
 * Запрос ссылки восстановления.
 *
 * Ответ одинаковый на существующий и несуществующий адрес: иначе форма
 * превращается в способ проверять, работает ли человек в компании.
 */
export async function forgotPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте адрес" };
  }

  await requestPasswordReset({
    email: parsed.data.email,
    ip: await clientIp(),
  });

  return { sent: true };
}

/** Установка нового пароля по ссылке из письма. */
export async function resetPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  try {
    await resetPassword({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });
  } catch (error) {
    if (error instanceof PasswordError) return { error: error.message };
    throw error;
  }

  return { ok: "Пароль изменён" };
}
