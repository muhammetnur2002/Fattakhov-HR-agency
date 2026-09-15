"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { homePathFor } from "@/lib/nav";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";

export type LoginState = {
  error?: string;
  /** Пароль подошёл, нужен код из приложения. Форма показывает второе поле. */
  needsCode?: boolean;
};

/**
 * Куда вести, когда форма не просит вернуть на конкретную страницу —
 * callbackUrl тогда голый "/" (см. sanitizeCallbackUrl в page.tsx).
 *
 * Раньше "/" в этом случае шёл в signIn как есть, а правильный кабинет
 * подбирал уже proxy.ts вторым редиректом (homePathFor, lib/nav.ts).
 * Второй хоп после redirect() из Server Action браузер отражает не до
 * конца: адресная строка остаётся на "/", хотя на экране уже /a или
 * /dashboard. Здесь тот же homePathFor вызывается один раз, до signIn,
 * и второй хоп просто не нужен.
 *
 * Если email не найден или учётка выключена — отдаём "/" как раньше:
 * ошибку по существу всё равно вернёт сам signIn ниже.
 */
async function defaultHomeFor(email: FormDataEntryValue | null): Promise<string> {
  if (typeof email !== "string") return "/";
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true },
    select: { role: true },
  });
  return user ? homePathFor(user.role) : "/";
}

/**
 * Вход по email и паролю, при включённой двухфакторной — плюс код.
 *
 * Сообщение об ошибке пароля намеренно одно на все случаи: не подсказываем,
 * заведён ли такой email и не отключена ли учётка. А вот про код говорим
 * прямо: этот экран видит только тот, кто пароль уже знает, и «что-то
 * пошло не так» здесь лишь мешает.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // BR-29: форма входа — главная цель перебора паролей
  const rate = await guardRate("login");
  if (!rate.allowed) {
    return { error: rateLimitMessage(rate.retryAfter) };
  }

  const requestedCallback = String(formData.get("callbackUrl") || "/");
  const code = String(formData.get("code") || "").trim();

  const callbackUrl =
    requestedCallback === "/"
      ? await defaultHomeFor(formData.get("email"))
      : requestedCallback;

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      code,
      redirectTo: callbackUrl,
    });
    return {};
  } catch (error) {
    // signIn сигнализирует об успешном редиректе исключением — пропускаем его
    if (error instanceof CredentialsSignin) {
      if (error.code === "second_factor_required") {
        return { needsCode: true };
      }
      if (error.code === "second_factor_invalid") {
        return {
          needsCode: true,
          error: "Код не подошёл. Проверьте приложение или введите код восстановления",
        };
      }
      return { error: "Неверный email или пароль" };
    }
    if (error instanceof AuthError) {
      return { error: "Неверный email или пароль" };
    }
    throw error;
  }
}
