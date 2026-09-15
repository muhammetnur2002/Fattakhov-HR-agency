import { NextResponse, type NextRequest } from "next/server";

import { canDo } from "@/lib/access";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { REJECTION_REASON_LABELS } from "@/lib/labels";
import {
  buildCsv,
  reportFileName,
  type Sheet,
} from "@/lib/services/analytics/export";
import {
  clientAnalytics,
  defaultPeriod,
} from "@/lib/services/analytics/queries";

const RANGES: Record<string, number> = { month: 30, quarter: 90, year: 365 };

/**
 * Выгрузка отчёта клиента.
 *
 * Данные строятся тем же сервисом, что и дашборд, — иначе выгрузка
 * и экран однажды разойдутся в цифрах, и доверия не будет ни к тому,
 * ни к другому.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Требуется вход", { status: 401 });

  if (!canDo(actor, "analytics.client", { clientId: actor.clientId })) {
    return new NextResponse("Не найдено", { status: 404 });
  }

  const range = request.nextUrl.searchParams.get("range") ?? "quarter";
  const period = defaultPeriod(RANGES[range] ?? 90);
  const data = await clientAnalytics(actor, period);

  const sheets: Sheet[] = [
    {
      title: "Воронка",
      headers: ["Этап", "Дошло кандидатов", "Конверсия с предыдущего, %"],
      rows: data.funnel.map((s) => [
        s.name,
        s.reached,
        s.conversionFromPrevious ?? "—",
      ]),
    },
    {
      title: "Сроки",
      headers: ["Показатель", "Значение"],
      rows: [
        ["Кандидатов в работе", data.inProgress],
        ["Представлено за период", data.presentedInPeriod],
        ["Закрыто наймом за период", data.hiredInPeriod],
        ["Дней до первого кандидата (медиана)", data.daysToFirstCandidate ?? "—"],
        ["Дней до выхода (медиана)", data.timeToHire ?? "—"],
        [
          "Среднее время решения, рабочих часов",
          data.avgDecisionHours === null
            ? "—"
            : Math.round(data.avgDecisionHours),
        ],
      ],
    },
    {
      title: "Работа агентства за период",
      headers: ["Показатель", "Значение"],
      rows: [
        ["Кандидатов взято в работу", data.agencyWork.screened],
        ["Представлено", data.agencyWork.presented],
        ["Интервью проведено", data.agencyWork.interviewed],
      ],
    },
    {
      title: "Причины отказов",
      headers: ["Причина", "Количество"],
      rows: data.rejections.map((r) => [
        REJECTION_REASON_LABELS[r.reason],
        r.count,
      ]),
    },
  ];

  // Выгрузка аналитики — не доступ к ПДн, но факт экспорта фиксируем:
  // по нему видно, кто и когда выносил данные из системы (ТЗ 11.3)
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Report",
      entityId: "client-analytics",
      action: "export",
      diff: { range },
    },
  });

  return new NextResponse(buildCsv(sheets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName("Аналитика"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
