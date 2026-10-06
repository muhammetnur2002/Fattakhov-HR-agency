"use server";

import { headers } from "next/headers";

import type { DisclosureContactMode } from "@/lib/generated/prisma/enums";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { clientIp } from "@/lib/security/rate-limit";
import {
  DisclosureError,
  giveDisclosure,
} from "@/lib/services/disclosure-consent";

export type DisclosureState = { error?: string; given?: boolean };

const CONTACT_MODES: DisclosureContactMode[] = ["DIRECT", "VIA_AGENCY"];

/**
 * Кандидат подтверждает передачу данных конкретному работодателю.
 *
 * Публичное действие: аккаунта у кандидата нет, вся защита — в токене.
 * Адрес и браузер фиксируем вместе с подтверждением: §8.3 документа
 * считает их частью доказательства волеизъявления.
 *
 * Обе проверки — галочка и выбор режима контактов — обязательны и здесь,
 * а не только в разметке: форму можно отправить и мимо браузера, а по
 * документу ни один из вариантов не отмечен заранее, значит «ничего
 * не выбрал» это не «по умолчанию через агентство», а незаполненная форма.
 */
export async function giveDisclosureAction(
  _prev: DisclosureState,
  formData: FormData,
): Promise<DisclosureState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const token = String(formData.get("token") || "");
  const agreed = formData.get("agreed") === "on";
  const contactMode = String(formData.get("contactMode") || "");

  if (!agreed) {
    return { error: "Нужно отметить согласие, чтобы продолжить" };
  }
  if (!CONTACT_MODES.includes(contactMode as DisclosureContactMode)) {
    return { error: "Выберите, передавать ли работодателю ваши контакты" };
  }

  const head = await headers();

  try {
    await giveDisclosure({
      token,
      contactMode: contactMode as DisclosureContactMode,
      ip: clientIp(head),
      // Обрезаем: в базе нужен след, а не произвольной длины строка
      // из заголовка, которым управляет кто угодно
      userAgent: head.get("user-agent")?.slice(0, 500) ?? undefined,
    });
  } catch (error) {
    if (error instanceof DisclosureError) return { error: error.message };
    throw error;
  }

  return { given: true };
}
