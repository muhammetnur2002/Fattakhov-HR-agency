import { calendarTokenFor } from "@/lib/calendar/ical";
import { prisma } from "@/lib/db/prisma";
import { appOrigin } from "@/lib/urls";

/** Личная ссылка на календарь с учётом версии: после «Обновить ссылку» выдаётся новая. */
export async function calendarFeedUrl(userId: string): Promise<string> {
  const user = await prisma.user.findFirst({ where: { id: userId }, select: { calendarTokenVersion: true } });
  return `${appOrigin()}/api/calendar/${calendarTokenFor(userId, user?.calendarTokenVersion ?? 0)}.ics`;
}
