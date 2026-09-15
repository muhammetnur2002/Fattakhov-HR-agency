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
  agencyAnalytics,
  defaultPeriod,
} from "@/lib/services/analytics/queries";

const RANGES: Record<string, number> = { month: 30, quarter: 90, year: 365 };

/** Выгрузка внутреннего отчёта. Доступна тем же, кому и сама аналитика. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Требуется вход", { status: 401 });

  if (!canDo(actor, "analytics.agency")) {
    return new NextResponse("Не найдено", { status: 404 });
  }

  const range = request.nextUrl.searchParams.get("range") ?? "quarter";
  const data = await agencyAnalytics(actor, defaultPeriod(RANGES[range] ?? 90));

  const sheets: Sheet[] = [
    {
      title: "Воронка по агентству",
      headers: ["Этап", "Дошло кандидатов", "Конверсия с предыдущего, %"],
      rows: data.funnel.map((s) => [
        s.name,
        s.reached,
        s.conversionFromPrevious ?? "—",
      ]),
    },
    {
      title: "Загрузка команды",
      headers: [
        "Рекрутер",
        "Активных вакансий",
        "Кандидатов в работе",
        "Представил за период",
        "Качество, %",
      ],
      rows: data.load.map((r) => [
        r.fullName,
        r.activeVacancies,
        r.activeCandidates,
        r.presented,
        r.quality ?? "—",
      ]),
    },
    {
      title: "Вакансии в риске",
      headers: ["Номер", "Вакансия", "Клиент", "Дней в работе", "Причина"],
      rows: data.vacanciesAtRisk.map((v) => [
        v.number,
        v.title,
        v.clientName,
        v.daysActive,
        v.reason,
      ]),
    },
    {
      title: "Причины отказов клиентов",
      headers: ["Причина", "Количество"],
      rows: data.rejectionsByClient.map((r) => [
        REJECTION_REASON_LABELS[r.reason],
        r.count,
      ]),
    },
  ];

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Report",
      entityId: "agency-analytics",
      action: "export",
      diff: { range },
    },
  });

  return new NextResponse(buildCsv(sheets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName("Аналитика_агентства"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
