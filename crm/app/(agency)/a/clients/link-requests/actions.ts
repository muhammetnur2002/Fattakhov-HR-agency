"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "../actions";
import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { createClient } from "@/lib/services/clients";
import {
  rejectCrmLinkRequest,
  resolveCrmLinkRequest,
} from "@/lib/students-service";
import { clientSchema } from "@/lib/validation/client";

function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

/**
 * Заявка «объедините с профилем в CRM» → новый клиент, заведённый из
 * данных этого профиля. Компания на студенческой платформе получает
 * crmClientId и с той же заявки дальше входит в CRM без второго пароля
 * (см. lib/students-entry.ts).
 */
export async function createClientFromLinkRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const employerId = String(formData.get("employerId") || "");
  if (!employerId) return { error: "Заявка не найдена" };

  const parsed = clientSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  let clientId: string;
  try {
    authorizeOrThrow(actor, "client.manage");
    ({ id: clientId } = await createClient(actor, parsed.data));
    await resolveCrmLinkRequest(employerId, clientId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав для создания клиента" };
    }
    throw error;
  }

  revalidatePath("/a/clients/link-requests");
  revalidatePath("/a/clients");
  redirect(`/a/clients/${clientId}`);
}

/** Привязка заявки к уже существующему клиенту — вместо создания нового. */
export async function linkExistingClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const employerId = String(formData.get("employerId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!employerId || !clientId) return { error: "Выберите клиента" };

  try {
    authorizeOrThrow(actor, "client.manage", { clientId });
    await resolveCrmLinkRequest(employerId, clientId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    throw error;
  }

  revalidatePath("/a/clients/link-requests");
  return { ok: "Заявка привязана к клиенту" };
}

/** Отказ с пояснением — компания увидит его у себя и подаст заявку снова. */
export async function rejectLinkRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const employerId = String(formData.get("employerId") || "");
  const note = String(formData.get("note") || "").trim();
  if (!employerId) return { error: "Заявка не найдена" };
  if (!note) return { error: "Напишите, что нужно поправить или уточнить" };

  authorizeOrThrow(actor, "client.manage");
  await rejectCrmLinkRequest(employerId, note);

  revalidatePath("/a/clients/link-requests");
  return { ok: "Заявка отклонена, компания увидит пояснение" };
}
