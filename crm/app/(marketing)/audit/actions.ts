"use server";

import { headers } from "next/headers";

import { summarize, type Answers } from "@/lib/audit/score";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { createLead, LeadError } from "@/lib/services/leads";
import { auditLeadSchema } from "@/lib/validation/audit";

export type AuditLeadState = { error?: string; sent?: boolean };

/**
 * Заявка по итогам экспресс-аудита.
 *
 * Точка без авторизации, поэтому ограничение частоты обязательно
 * (BR-29), тем же ключом, что и обычная заявка с лендинга: иначе
 * достаточно перейти на аудит, чтобы обойти лимит формы.
 *
 * Выжимка расчёта складывается здесь, а не приходит с клиента:
 * иначе в заметке рекрутера мог бы оказаться любой текст, выданный
 * за результат аудита.
 */
export async function submitAuditAction(
  _prev: AuditLeadState,
  formData: FormData,
): Promise<AuditLeadState> {
  const rate = await guardRate("publicSubmit");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  let answers: unknown;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "null"));
  } catch {
    return { error: "Не удалось прочитать ответы. Обновите страницу." };
  }

  const parsed = auditLeadSchema.safeParse({
    name: formData.get("name"),
    contact: formData.get("contact"),
    company: formData.get("company"),
    note: formData.get("note"),
    consent: formData.get("consent"),
    marketingConsent: formData.get("marketingConsent"),
    answers,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  // Галочку дальше не несём: её работа закончена на проверке схемой,
  // а в заявку идёт версия текста, под которым она поставлена
  const { answers: ответы, note, consent, ...contact } = parsed.data;
  void consent;

  // Ключи приходят строками из JSON, расчёт работает с числами
  const числовые: Answers = Object.fromEntries(
    Object.entries(ответы).map(([k, v]) => [Number(k), v]),
  );

  const head = await headers();

  try {
    await createLead(
      {
        ...contact,
        website: null,
        vacancies: null,
        note: [summarize(числовые), note].filter(Boolean).join("\n\n"),
      },
      {
        ip: head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: head.get("user-agent"),
      },
    );
  } catch (error) {
    if (error instanceof LeadError) return { error: error.message };
    throw error;
  }

  return { sent: true };
}
