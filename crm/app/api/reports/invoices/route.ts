import { NextResponse } from "next/server";

import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { buildCsv, reportFileName, type Sheet } from "@/lib/services/analytics/export";
import { listInvoices } from "@/lib/services/invoices";
import { formatDate } from "@/lib/format-date";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ISSUED: "Выставлен",
  PAID: "Оплачен",
  OVERDUE: "Просрочен",
};

/**
 * Выгрузка истории счетов клиента.
 *
 * В отличие от выгрузки кандидатов (которую пока не делаем — нет
 * согласия на раскрытие данных конкретному работодателю), здесь
 * персональных данных не в: это собственные финансовые документы
 * клиента о его собственном счёте.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return new NextResponse("Требуется вход", { status: 401 });
  if (!actor.clientId) return new NextResponse("Не найдено", { status: 404 });

  const invoices = await listInvoices(actor);

  const sheets: Sheet[] = [
    {
      title: "Счета",
      headers: [
        "Номер",
        "Статус",
        "Сумма, ₽",
        "Описание",
        "Выставлен",
        "Срок оплаты",
        "Оплачен",
      ],
      rows: invoices.map((i) => [
        i.number,
        STATUS_LABELS[i.status] ?? i.status,
        i.amount,
        i.description ?? "",
        i.issuedAt ? formatDate(i.issuedAt) : "",
        i.dueAt ? formatDate(i.dueAt) : "",
        i.paidAt ? formatDate(i.paidAt) : "",
      ]),
    },
  ];

  // Тот же принцип, что и у выгрузки аналитики: не ПДн, но факт
  // экспорта фиксируем — по нему видно, кто и когда выносил данные
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Report",
      entityId: "client-invoices",
      action: "export",
    },
  });

  return new NextResponse(buildCsv(sheets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName("Счета"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
