"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { acceptInvitation, InviteError } from "@/lib/services/invitations";
import { acceptInviteSchema } from "@/lib/validation/auth";

export type AcceptState = { error?: string };

export async function acceptInvite(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  // BR-29: приглашение создаёт учётную запись — точка ценная для перебора
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const token = String(formData.get("token") || "");

  const parsed = acceptInviteSchema.safeParse({
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  let email: string;
  try {
    ({ email } = await acceptInvitation({ token, ...parsed.data }));
  } catch (error) {
    if (error instanceof InviteError) return { error: error.message };
    throw error;
  }

  // Сразу входим под созданным пользователем: заставлять человека
  // тут же вводить только что заданный пароль — лишний шаг.
  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Аккаунт создан, но войти не удалось. Попробуйте войти вручную." };
    }
    throw error;
  }
}
