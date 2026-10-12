"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { SessionSettingsError, setSessionLimits } from "@/lib/services/session-settings";

export type SessionSettingsState = { error?: string; ok?: string };

/** Сохранить предел сессии. Только владелец (org.settings). */
export async function saveSessionLimitsAction(
  _prev: SessionSettingsState,
  formData: FormData,
): Promise<SessionSettingsState> {
  const actor = await requireAgencyActor();
  try {
    await setSessionLimits(actor, {
      agency: formData.get("agency"),
      client: formData.get("client"),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof SessionSettingsError) return { error: error.message };
    throw error;
  }
  revalidatePath("/a/settings");
  return {
    ok: "Сохранено. Правило действует на все сессии сразу, и тех, кто вошёл раньше, оно тоже касается.",
  };
}
