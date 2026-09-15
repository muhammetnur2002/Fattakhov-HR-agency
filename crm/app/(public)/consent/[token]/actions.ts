"use server";

import { headers } from "next/headers";

import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { clientIp } from "@/lib/security/rate-limit";
import { ConsentError, giveConsent } from "@/lib/services/consent";

export type ConsentState = { error?: string; given?: boolean };

/**
 * Кандидат подтверждает согласие на обработку данных.
 *
 * Публичное действие: аккаунта у кандидата нет и не будет, вся защита —
 * в токене. Адрес фиксируем вместе с согласием: без него подтвердить
 * факт невозможно.
 */
export async function giveConsentAction(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const token = String(formData.get("token") || "");
  const agreed = formData.get("agreed") === "on";

  if (!agreed) {
    return { error: "Нужно отметить согласие, чтобы продолжить" };
  }

  try {
    await giveConsent({ token, ip: clientIp(await headers()) });
  } catch (error) {
    if (error instanceof ConsentError) return { error: error.message };
    throw error;
  }

  return { given: true };
}
