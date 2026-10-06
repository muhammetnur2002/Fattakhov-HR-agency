"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";

import { signIn } from "@/auth";
import { maskPhone, PhoneFormatError } from "@/lib/auth/phone";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { clientIp } from "@/lib/security/rate-limit";
import { SmsSendError } from "@/lib/notifications/sms";
import {
  checkPhoneCode,
  PhoneCodeError,
  requestPhoneCode,
} from "@/lib/services/phone-auth";

/**
 * Быстрый вход и регистрация по номеру телефона.
 *
 * Одни и те же действия на странице регистрации и на странице входа.
 * Разница — только галочка согласия: с регистрации она приходит, со
 * входа нет, и человека без аккаунта вход не заводит, а отправляет
 * регистрироваться (needsRegistration).
 *
 * Куда вести после входа — всегда /dashboard: быстрым способом
 * заводится только администратор клиента, а кабинет клиента сам уводит
 * на анкету (/onboarding), пока она не пройдена.
 */

export type QuickAuthState = {
  error?: string;
  /** Включён второй фактор — форма покажет поле для кода из приложения. */
  needsCode?: boolean;
  /** Аккаунта нет, а согласия не давали — нужна регистрация. */
  needsRegistration?: boolean;
};

function mapSignInError(error: unknown): QuickAuthState | null {
  if (error instanceof CredentialsSignin) {
    switch (error.code) {
      case "second_factor_required":
        return { needsCode: true };
      case "second_factor_invalid":
        return {
          needsCode: true,
          error: "Код не подошёл. Проверьте приложение или введите код восстановления",
        };
      case "needs_registration":
        return { needsRegistration: true };
      case "phone_code_invalid":
        return { error: "Код не подошёл — запросите новый" };
      default:
        return { error: "Не получилось войти. Попробуйте ещё раз" };
    }
  }
  if (error instanceof AuthError) {
    return { error: "Не получилось войти. Попробуйте ещё раз" };
  }
  return null;
}

export type PhoneCodeState = {
  error?: string;
  /** Нормализованный номер — форма шлёт его обратно вместе с кодом. */
  phone?: string;
  /** Куда ушёл код, в виде «+7 900 ***-**-67». */
  sentTo?: string;
};

/** Шаг 1 входа по телефону: прислать код. */
export async function requestPhoneCodeAction(rawPhone: string): Promise<PhoneCodeState> {
  const rate = await guardRate("smsRequest");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    const { phone } = await requestPhoneCode(rawPhone, { ip: clientIp(await headers()) });
    return { phone, sentTo: maskPhone(phone) };
  } catch (error) {
    if (error instanceof PhoneFormatError || error instanceof PhoneCodeError) {
      return { error: error.message };
    }
    if (error instanceof SmsSendError) {
      return { error: "SMS не отправилось. Попробуйте через минуту или войдите по почте" };
    }
    throw error;
  }
}

/**
 * Шаг 2: код из SMS.
 *
 * Код сначала проверяется здесь — только чтобы сказать человеку точную
 * причину («неверный» или «устарел»), — а потом ещё раз в провайдере:
 * колбэк Auth.js можно позвать и напрямую, минуя эту форму.
 */
export async function phoneSignInAction(params: {
  phone: string;
  smsCode: string;
  consent: boolean;
  code?: string;
}): Promise<QuickAuthState> {
  const rate = await guardRate("quickAuth");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    await checkPhoneCode(params.phone, params.smsCode);
  } catch (error) {
    if (error instanceof PhoneCodeError || error instanceof PhoneFormatError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    await signIn("phone", {
      phone: params.phone,
      smsCode: params.smsCode,
      consent: params.consent ? "on" : "",
      code: params.code ?? "",
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    const mapped = mapSignInError(error);
    if (mapped) return mapped;
    throw error;
  }
}
