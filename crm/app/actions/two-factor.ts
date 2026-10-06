"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import QRCode from "qrcode";

import { maskPhone } from "@/lib/auth/phone";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SmsSendError } from "@/lib/notifications/sms";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { clientIp } from "@/lib/security/rate-limit";
import { PhoneCodeError, requestPhoneCode } from "@/lib/services/phone-auth";
import {
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  TwoFactorError,
} from "@/lib/services/two-factor";

export type TwoFactorState = {
  error?: string;
  ok?: string;
  /** Данные для подключения. Живут только в ответе, в базу QR не пишется. */
  setup?: { secret: string; qr: string };
  /** Коды восстановления. Показываются один раз: в базе только хеши. */
  codes?: string[];
};

/**
 * Начало подключения: секрет и QR для приложения.
 *
 * Только после подтверждения личности — текущим паролем или кодом из SMS
 * (у тех, у кого пароля нет). Просит актора allowWithoutTwoFactor: это
 * действие и есть выход из «2FA ещё не включена».
 */
export async function startTwoFactorAction(input: {
  password?: string;
  smsCode?: string;
}): Promise<TwoFactorState> {
  const actor = await requireActor({ allowWithoutTwoFactor: true });

  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    const organization = await prisma.organization.findFirst({
      where: { id: actor.organizationId },
      select: { name: true },
    });

    const setup = await startTwoFactorSetup({
      userId: actor.id,
      issuer: organization?.name ?? "Fattakhov HR",
      password: typeof input?.password === "string" ? input.password : undefined,
      smsCode: typeof input?.smsCode === "string" ? input.smsCode : undefined,
    });

    // QR рисуем на сервере в data: URI. Клиентская библиотека потянула бы
    // в браузер лишний код ради экрана, который открывают один раз
    const qr = await QRCode.toDataURL(setup.otpauthUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return { setup: { secret: setup.secret, qr } };
  } catch (error) {
    if (error instanceof TwoFactorError) return { error: error.message };
    throw error;
  }
}

/**
 * Код из SMS для тех, у кого нет пароля: им 2FA подтверждается им.
 * У тех, у кого пароль есть, SMS не нужен и не отправляется — иначе
 * это был бы второй способ включить 2FA без пароля.
 */
export async function requestTwoFactorSmsAction(): Promise<{ error?: string; sentTo?: string }> {
  const actor = await requireActor({ allowWithoutTwoFactor: true });

  const rate = await guardRate("smsRequest");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const user = await prisma.user.findFirst({
    where: { id: actor.id, isActive: true },
    select: { passwordHash: true, phoneVerified: true },
  });
  if (!user || user.passwordHash || !user.phoneVerified) {
    return { error: "Подтвердить кодом из SMS нельзя — используйте пароль" };
  }

  try {
    await requestPhoneCode(user.phoneVerified, { ip: clientIp(await headers()) });
    return { sentTo: maskPhone(user.phoneVerified) };
  } catch (error) {
    if (error instanceof PhoneCodeError) return { error: error.message };
    if (error instanceof SmsSendError) {
      return { error: "SMS не отправилось. Попробуйте через минуту" };
    }
    throw error;
  }
}

export async function confirmTwoFactorAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const actor = await requireActor({ allowWithoutTwoFactor: true });

  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    const codes = await confirmTwoFactor({
      userId: actor.id,
      code: String(formData.get("code") || ""),
    });

    revalidatePath("/settings");
    revalidatePath("/a/settings");
    return { codes, ok: "Двухфакторная аутентификация включена" };
  } catch (error) {
    if (error instanceof TwoFactorError) return { error: error.message };
    throw error;
  }
}

export async function disableTwoFactorAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const actor = await requireActor();

  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    await disableTwoFactor({
      userId: actor.id,
      password: String(formData.get("password") || ""),
    });

    revalidatePath("/settings");
    revalidatePath("/a/settings");
    return { ok: "Двухфакторная аутентификация выключена" };
  } catch (error) {
    if (error instanceof TwoFactorError) return { error: error.message };
    throw error;
  }
}

export async function regenerateCodesAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const actor = await requireActor();

  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    const codes = await regenerateRecoveryCodes({
      userId: actor.id,
      password: String(formData.get("password") || ""),
    });

    revalidatePath("/settings");
    revalidatePath("/a/settings");
    return { codes, ok: "Коды перевыпущены, прежние больше не работают" };
  } catch (error) {
    if (error instanceof TwoFactorError) return { error: error.message };
    throw error;
  }
}
