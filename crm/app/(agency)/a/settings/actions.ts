"use server";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import {
  checkAlertChannels,
  type AlertCheckResult,
} from "@/lib/monitoring/alert-check";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";

export type AlertCheckState = { error?: string; result?: AlertCheckResult };

/**
 * Проверить канал оповещений о сбоях.
 *
 * Шлёт настоящее письмо и настоящие сообщения в мессенджеры: канал,
 * который «проверен» имитацией, проверенным не является. Поэтому же
 * частота ограничена — ящик сбоев не должен тонуть в проверках.
 *
 * Отказ в правах — сообщением, а не 404: до кнопки человек уже дошёл,
 * страницу ему открыли, и молчаливое исчезновение выглядело бы поломкой.
 */
export async function checkAlertsAction(): Promise<AlertCheckState> {
  // Ни прежнего состояния, ни полей формы здесь не нужно: кнопка одна,
  // а результат всегда строится заново. useActionState передаст их
  // всё равно — необъявленные аргументы просто не используются.
  const actor = await requireAgencyActor();

  try {
    authorizeOrThrow(actor, "org.settings");
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  const rate = await guardRate("alertCheck", actor.id);
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  return { result: await checkAlertChannels(actor) };
}
