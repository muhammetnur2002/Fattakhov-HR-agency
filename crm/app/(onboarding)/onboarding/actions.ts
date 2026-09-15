"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { acceptTariff, AgreementError } from "@/lib/services/agreements";
import { acceptTariffSchema } from "@/lib/validation/client";

export type OnboardingState = { error?: string };

/**
 * Клиент выбрал условия сотрудничества (сценарий A, шаг 3).
 *
 * Выбирать может только администратор клиента: он подписант.
 * Договор создаётся в PENDING — сделкой его делает подтверждение агентства.
 */
export async function acceptTariffAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const actor = await requireClientActor();

  if (!actor.clientId) {
    return { error: "Пользователь не привязан к компании" };
  }
  // То же правило, что закрывает экран выбора, — из матрицы, а не
  // именем роли в двух местах: разъехавшись, они дали бы форму,
  // которая видна и не работает
  if (!canDo(actor, "agreement.accept", { clientId: actor.clientId })) {
    return { error: "Выбрать условия может только администратор компании" };
  }

  const parsed = acceptTariffSchema.safeParse({
    presetKey: formData.get("presetKey"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Выберите условия" };
  }

  try {
    await acceptTariff({
      organizationId: actor.organizationId,
      clientId: actor.clientId,
      presetKey: parsed.data.presetKey,
      acceptedByUserId: actor.id,
    });
  } catch (error) {
    if (error instanceof AgreementError) return { error: error.message };
    throw error;
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
