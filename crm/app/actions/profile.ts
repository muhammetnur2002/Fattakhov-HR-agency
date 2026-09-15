"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { profileSchema } from "@/lib/validation/auth";

export type ProfileState = { error?: string; ok?: string };

/**
 * Свои данные — имя, телефон, должность.
 *
 * До этого действия исправить опечатку в имени или добавить телефон
 * после принятия приглашения было нельзя вообще: эти поля задаются
 * один раз на экране приглашения и дальше нигде не редактируются.
 */
export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const actor = await requireActor();

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    position: formData.get("position"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
      position: parsed.data.position || null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/a/settings");
  return { ok: "Сохранено" };
}
