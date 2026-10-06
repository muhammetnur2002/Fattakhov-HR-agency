"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { categoriesInUse } from "@/lib/notifications/events";
import { markNotificationsRead } from "@/lib/notifications/notify";
import {
  issueVkLinkCode,
  unlinkVk,
  vkLinkStatus,
  type VkLinkStatus,
} from "@/lib/notifications/vk-link";

export type NotifySettingsState = { error?: string; ok?: string };

export async function markAllReadAction(): Promise<void> {
  const actor = await requireActor();
  await markNotificationsRead(actor.id);
  revalidatePath("/", "layout");
}

export async function markReadAction(ids: string[]): Promise<void> {
  const actor = await requireActor();
  await markNotificationsRead(actor.id, ids);
  revalidatePath("/", "layout");
}

/** Настройки каналов. Событийный состав фиксирован, включаются каналы. */
export async function saveNotifySettingsAction(
  _prev: NotifySettingsState,
  formData: FormData,
): Promise<NotifySettingsState> {
  const actor = await requireActor();

  /*
    Поле ВК стоит в форме, только когда ВК подключён на сервере
    (NotificationSettings). Нет поля — нет и ответа про ВК: прежние
    страница и галочка остаются как были. Иначе каждое сохранение
    настроек до подключения ВК записывало бы «ВК выключен», и после
    подключения человек, вписав страницу, не получал бы ничего — галочка
    стояла бы снятой с того давнего сохранения, а заметить это неоткуда.
  */
  // Признак «ВК в форме» — скрытое поле vkInForm: сама галочка при
  // снятии в форму не попадает, по её отсутствию не отличить «выключено»
  const vkInForm = formData.has("vkInForm");
  /*
    То же с пушем: галочка в форме, только когда канал настроен на
    сервере, и о её присутствии говорит скрытое поле pushInForm — снятая
    галочка в форму не попадает вовсе, по ней одной «нет в форме»
    не отличить от «выключено».
  */
  const pushInForm = formData.has("pushInForm");
  const stored: StoredChannelPrefs =
    vkInForm && pushInForm ? {} : await storedChannelPrefs(actor.id);

  // Чекбокс не пришёл в форме — значит выключен; по умолчанию всё включено
  const categories = Object.fromEntries(
    categoriesInUse().map((cat) => [cat, formData.get(`cat_${cat}`) === "on"]),
  );

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      notifyPrefs: {
        email: formData.get("email") === "on",
        // Без поля ВК — прежнее значение; нет и его — ключа нет, то есть
        // «включено», как у всякого канала по умолчанию
        ...(vkInForm
          ? { vk: formData.get("vk") === "on" }
          : stored.vk === undefined
            ? {}
            : { vk: stored.vk }),
        ...(pushInForm
          ? { push: formData.get("push") === "on" }
          : stored.push === undefined
            ? {}
            : { push: stored.push }),
        categories,
      },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/a/settings");
  return { ok: "Настройки сохранены" };
}

/**
 * Выдать код привязки ВКонтакте. Страницу человека сюда не принимаем:
 * её даст только сообщение от этой страницы (lib/notifications/vk-link.ts).
 */
export async function issueVkLinkCodeAction(): Promise<
  { code: string; expiresAt: string } | { error: string }
> {
  const actor = await requireActor();
  if (!process.env.VK_BOT_TOKEN?.trim() || !process.env.VK_GROUP_ID?.trim()) {
    return { error: "ВКонтакте на сервере ещё не подключён." };
  }
  const { code, expiresAt } = await issueVkLinkCode(actor.id);
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Дошёл ли код: опрашивает открытый экран настроек, пока человек пишет сообществу. */
export async function vkLinkStatusAction(code: string): Promise<VkLinkStatus> {
  const actor = await requireActor();
  return vkLinkStatus(actor.id, String(code));
}

/** Отвязать ВКонтакте по желанию человека. */
export async function unlinkVkAction(): Promise<void> {
  const actor = await requireActor();
  await unlinkVk(actor.id);
  revalidatePath("/settings");
  revalidatePath("/a/settings");
}

/**
 * Сохранённые галочки каналов, которых в форме может не быть (ВК, пуш):
 * false — человек выключал сам, undefined — не трогал.
 */
type StoredChannelPrefs = { vk?: boolean; push?: boolean };

async function storedChannelPrefs(userId: string): Promise<StoredChannelPrefs> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { notifyPrefs: true },
  });
  const prefs = user?.notifyPrefs;
  if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs)) {
    return {};
  }
  const { vk, push } = prefs as Record<string, unknown>;
  return {
    vk: typeof vk === "boolean" ? vk : undefined,
    push: typeof push === "boolean" ? push : undefined,
  };
}
