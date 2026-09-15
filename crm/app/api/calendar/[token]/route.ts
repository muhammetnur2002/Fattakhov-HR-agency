import { NextResponse } from "next/server";

import { visibleVacanciesFilter, type Actor } from "@/lib/access";
import { buildCalendar, parseCalendarToken } from "@/lib/calendar/ical";
import { prisma } from "@/lib/db/prisma";
import { link, resolveLink } from "@/lib/notifications/links";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { appOrigin } from "@/lib/urls";

/** Сколько вперёд и назад отдаём в фид. */
const DAYS_BACK = 30;
const DAYS_AHEAD = 180;

/**
 * Персональный iCal-фид.
 *
 * Открывается без сессии — по подписанной ссылке, потому что календарь
 * ходит за ней сам, без куки. Права при этом соблюдаются: набор встреч
 * строится под конкретного пользователя через тот же слой доступа,
 * что и в интерфейсе.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const rate = await guardRate("publicToken");
  if (!rate.allowed) {
    return new NextResponse(rateLimitMessage(rate.retryAfter), { status: 429 });
  }

  const { token } = await params;
  const userId = parseCalendarToken(token.replace(/\.ics$/, ""));

  if (!userId) {
    return new NextResponse("Ссылка недействительна", { status: 404 });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      id: true,
      organizationId: true,
      role: true,
      clientId: true,
      fullName: true,
    },
  });
  if (!user) return new NextResponse("Не найдено", { status: 404 });

  const actor: Actor = {
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
    clientId: user.clientId,
  };

  const from = new Date();
  from.setDate(from.getDate() - DAYS_BACK);
  const to = new Date();
  to.setDate(to.getDate() + DAYS_AHEAD);

  const interviews = await prisma.interview.findMany({
    where: {
      organizationId: actor.organizationId,
      vacancy: visibleVacanciesFilter(actor),
      scheduledAt: { gte: from, lte: to },
      status: { in: ["CONFIRMED", "CANCELLED"] },
      // Только встречи, где человек участвует: чужие в личном календаре
      // не нужны, даже если он имеет к ним доступ в кабинете
      participantUserIds: { has: actor.id },
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      durationMinutes: true,
      format: true,
      meetingUrl: true,
      address: true,
      application: {
        select: { id: true, candidate: { select: { fullName: true } } },
      },
      vacancy: {
        select: { title: true, client: { select: { name: true } } },
      },
    },
  });

  const baseUrl = appOrigin();

  // Карточка кандидата лежит в кабинетах по разным адресам, а фид
  // персональный — знаем, кому он принадлежит, и ставим его путь.
  // Раньше здесь был жёстко клиентский: рекрутёр из своего же
  // календаря попадал на дашборд, потому что прокси уводит агентского
  // пользователя с клиентских страниц
  const cardPath = (applicationId: string) =>
    resolveLink(link.application(applicationId), actor.role);

  const body = buildCalendar({
    name: "Интервью",
    events: interviews
      .filter((i) => i.scheduledAt)
      .map((i) => ({
        uid: `interview-${i.id}@hr-platform`,
        startsAt: i.scheduledAt!,
        durationMinutes: i.durationMinutes,
        summary: `Интервью: ${i.application.candidate.fullName} — ${i.vacancy.title}`,
        description: [
          `Кандидат: ${i.application.candidate.fullName}`,
          `Вакансия: ${i.vacancy.title}`,
          `Компания: ${i.vacancy.client.name}`,
          `Карточка: ${baseUrl}${cardPath(i.application.id)}`,
        ].join("\n"),
        location:
          i.format === "ONLINE"
            ? (i.meetingUrl ?? "Онлайн")
            : (i.address ?? "Офис"),
        url: i.meetingUrl ?? undefined,
        cancelled: i.status === "CANCELLED",
      })),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
