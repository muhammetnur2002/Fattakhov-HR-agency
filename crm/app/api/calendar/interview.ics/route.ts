import { NextResponse, type NextRequest } from "next/server";

import { buildCalendar } from "@/lib/calendar/ical";
import { prisma } from "@/lib/db/prisma";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";

/**
 * Файл встречи для кандидата.
 *
 * Отдаётся по тому же токену, что и страница выбора времени: у кандидата
 * нет аккаунта, и кнопка «добавить в календарь» должна работать сразу
 * после подтверждения, без входа куда-либо.
 *
 * Токен гасится при выборе слота, поэтому здесь ищем встречу и по
 * действующему токену, и по недавно подтверждённой — иначе кнопка
 * на экране успеха оказалась бы нерабочей.
 */
export async function GET(request: NextRequest) {
  const rate = await guardRate("publicToken");
  if (!rate.allowed) {
    return new NextResponse(rateLimitMessage(rate.retryAfter), { status: 429 });
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Некорректная ссылка", { status: 400 });

  const interview = await prisma.interview.findFirst({
    where: {
      OR: [
        { candidateToken: token, tokenExpiresAt: { gt: new Date() } },
        { lastCandidateToken: token, status: "CONFIRMED" },
      ],
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      durationMinutes: true,
      format: true,
      meetingUrl: true,
      address: true,
      vacancy: {
        select: { title: true, client: { select: { name: true } } },
      },
    },
  });

  if (!interview?.scheduledAt) {
    return new NextResponse("Встреча не найдена", { status: 404 });
  }

  const body = buildCalendar({
    name: "Интервью",
    events: [
      {
        uid: `interview-${interview.id}@hr-platform`,
        startsAt: interview.scheduledAt,
        durationMinutes: interview.durationMinutes,
        summary: `Интервью: ${interview.vacancy.title} — ${interview.vacancy.client.name}`,
        description:
          interview.format === "ONLINE"
            ? "Онлайн-встреча. Ссылка в приглашении."
            : "Встреча в офисе.",
        location:
          interview.format === "ONLINE"
            ? (interview.meetingUrl ?? "Онлайн")
            : (interview.address ?? "Офис"),
        url: interview.meetingUrl ?? undefined,
        cancelled: interview.status === "CANCELLED",
      },
    ],
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interview.ics"',
    },
  });
}
