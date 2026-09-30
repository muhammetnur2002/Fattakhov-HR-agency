"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireActor } from "@/lib/auth/session";

export type CalendarLinkState = { ok?: string; error?: string };

/**
 * Обновить личную ссылку на календарь: прежняя перестаёт работать сразу.
 * Нужно, если ссылку кому-то переслали или она попала не туда. Подписку придётся
 * добавить в календарь заново — по новой ссылке.
 */
export async function regenerateCalendarLinkAction(): Promise<CalendarLinkState> {
  const actor = await requireActor();
  await prisma.user.update({
    where: { id: actor.id },
    data: { calendarTokenVersion: { increment: 1 } },
  });
  revalidatePath("/calendar");
  revalidatePath("/a/calendar");
  return { ok: "Ссылка обновлена. Прежняя больше не работает — добавьте новую в свой календарь." };
}
