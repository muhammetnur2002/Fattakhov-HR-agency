"use server";

import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { confirmEmail, EmailConfirmError } from "@/lib/services/email-confirmation";

export type ConfirmEmailState = { confirmed?: string; error?: string };

/**
 * Подтверждение по нажатию кнопки, а не по самому переходу: почтовые
 * сканеры и предпросмотр ссылок открывают их без человека, и адрес
 * подключался бы без его ведома.
 */
export async function confirmEmailAction(
  _prev: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const rate = await guardRate("publicToken");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  try {
    const { email } = await confirmEmail(String(formData.get("token") ?? ""));
    return { confirmed: email };
  } catch (error) {
    if (error instanceof EmailConfirmError) return { error: error.message };
    throw error;
  }
}
