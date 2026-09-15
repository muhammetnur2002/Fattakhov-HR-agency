"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
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

/** Начало подключения: секрет и QR для приложения. */
export async function startTwoFactorAction(): Promise<TwoFactorState> {
  const actor = await requireActor();

  try {
    const organization = await prisma.organization.findFirst({
      where: { id: actor.organizationId },
      select: { name: true },
    });

    const setup = await startTwoFactorSetup({
      userId: actor.id,
      issuer: organization?.name ?? "Fattakhov HR",
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

export async function confirmTwoFactorAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const actor = await requireActor();

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
