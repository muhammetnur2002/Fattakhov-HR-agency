"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { categoriesInUse } from "@/lib/notifications/events";
import { markNotificationsRead } from "@/lib/notifications/notify";

export type NotifySettingsState = { error?: string; ok?: string };

export async function markAllReadAction(): Promise<void> {
  const actor = await requireActor();
  await markNotificationsRead(actor.id);
  revalidatePath("/", "layout");
}

export async function markReadAction(ids: string[]): Promise<void> {
  const actor = await requireActor();
  await markNotificationsRead(actor.id, ids);
}

/** Настройки каналов. Событийный состав фиксирован, включаются каналы. */
export async function saveNotifySettingsAction(
  _prev: NotifySettingsState,
  formData: FormData,
): Promise<NotifySettingsState> {
  const actor = await requireActor();

  const telegramChatId = String(formData.get("telegramChatId") || "").trim();

  // Чекбокс не пришёл в форме — значит выключен; по умолчанию всё включено
  const categories = Object.fromEntries(
    categoriesInUse().map((cat) => [cat, formData.get(`cat_${cat}`) === "on"]),
  );

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      notifyPrefs: {
        email: formData.get("email") === "on",
        telegram: formData.get("telegram") === "on",
        categories,
      },
      // Пустая строка — отвязка бота
      telegramChatId: telegramChatId || null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/a/settings");
  return { ok: "Настройки сохранены" };
}
