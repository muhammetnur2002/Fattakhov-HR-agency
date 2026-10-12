"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { prisma } from "@/lib/db/prisma";
import { setShowPresence } from "@/lib/services/presence";
import { profileSchema } from "@/lib/validation/auth";
import { invalidForm } from "@/lib/validation/form-errors";

export type ProfileState = FormState;

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
  if (!parsed.success) return invalidForm(parsed.error);

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

/**
 * «Показывать, что я в сети» — только у владельца агентства.
 *
 * Скрыть статус может один владелец; сотрудники агентства и клиенты
 * отклоняются здесь и ещё раз в setShowPresence (по роли из базы): у них
 * переключателя в интерфейсе нет, а прямой вызов действия ничего не меняет.
 *
 * Выключенный переключатель в форму не попадает вовсе, поэтому форма
 * целиком про одно это поле: отсутствие галочки — и есть «выключено».
 * Выключая, сервер стирает и прежнюю отметку «был(а) последний раз»
 * (lib/services/presence.ts) — скрыть статус и хранить его было бы
 * не тем, о чём просили.
 */
export async function savePresenceAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const actor = await requireActor();
  const show = formData.get("showPresence") === "on";

  if (actor.role !== "OWNER" || !(await setShowPresence(actor.id, show))) {
    return { error: "Скрыть статус «в сети» может только владелец агентства" };
  }

  revalidatePath("/settings");
  revalidatePath("/a/settings");
  return {
    ok: show
      ? "Коллеги и клиенты видят, когда вы в сети"
      : "Статус скрыт: вас не видно в сети, и мы не запоминаем, когда вы заходили",
  };
}
