"use server";

import { headers } from "next/headers";

import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { createLead, LeadError } from "@/lib/services/leads";
import { leadSchema } from "@/lib/validation/lead";

export type LeadState = { error?: string; sent?: boolean };

/**
 * Заявка с лендинга.
 *
 * Точка без авторизации, поэтому ограничение частоты обязательно (BR-29):
 * иначе форму зальют за минуту, и настоящая заявка утонет.
 */
export async function submitLeadAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  );

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  const head = await headers();

  try {
    await createLead(parsed.data, {
      // Тот же порядок, что в guardRate: за прокси реальный адрес
      // приходит заголовком, напрямую его нет вовсе
      ip: head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: head.get("user-agent"),
    });
  } catch (error) {
    if (error instanceof LeadError) return { error: error.message };
    throw error;
  }

  return { sent: true };
}
