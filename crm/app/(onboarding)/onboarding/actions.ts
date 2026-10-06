"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { acceptTariff, AgreementError } from "@/lib/services/agreements";
import { BriefError, completeRegistrationBrief } from "@/lib/services/registration";
import { acceptTariffSchema } from "@/lib/validation/client";
import { briefSchema } from "@/lib/validation/registration";

export type OnboardingState = { error?: string };

export type BriefState = {
  error?: string;
  /** Поле, на котором споткнулись, — анкета вернёт человека к нему. */
  field?: string;
  ok?: boolean;
};

/**
 * Анкета после регистрации (components/onboarding/brief-wizard.tsx).
 *
 * Принимает объект, а не FormData: ответы копятся в браузере по одному
 * вопросу и уходят разом в конце — формы, которую можно было бы
 * отправить целиком, на экране нет ни в один момент.
 */
export async function completeBriefAction(
  values: Record<string, string>,
): Promise<BriefState> {
  const actor = await requireClientActor();

  const parsed = briefSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? "Проверьте ответы",
      field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
    };
  }

  try {
    await completeRegistrationBrief(actor, parsed.data);
  } catch (error) {
    if (error instanceof BriefError) {
      const message = error.message;
      // Сервис говорит словами; поле угадываем по смыслу, чтобы вернуть
      // человека туда, где исправлять
      const field = /телефон|номер/i.test(message)
        ? "phone"
        : /адрес|почт/i.test(message)
          ? "email"
          : undefined;
      return { error: message, field };
    }
    throw error;
  }

  revalidatePath("/onboarding");
  return { ok: true };
}

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
