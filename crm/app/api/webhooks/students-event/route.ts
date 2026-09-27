import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/notify";
import { studentsGrantRecipients } from "@/lib/notifications/recipients";
import { safeEqual } from "@/lib/services/passwords";
import type { EventCode } from "@/lib/notifications/events";
import type { StaffGrant } from "@/lib/access";

/**
 * Событие со студенческой платформы: новая компания/вакансия на модерации,
 * справка студента, заявка на привязку к CRM. Раньше об этом узнавали,
 * только зайдя на страницу «Проверок» — колокольчик молчал, пока кто-то
 * сам не откроет и не обновит список.
 *
 * Тот же секрет, что и у обратного направления (lib/students-service.ts):
 * один общий CRM_SERVICE_SECRET, вызовы симметричны — кто угодно из двух
 * приложений может проверить подпись другого.
 */
const KIND_TO_EVENT: Record<
  string,
  { event: EventCode; grant: StaffGrant; linkUrl: string }
> = {
  company: {
    event: "STUDENTS_COMPANY_PENDING",
    grant: "students.moderation",
    linkUrl: "/a/reviews/moderation",
  },
  vacancy: {
    event: "STUDENTS_VACANCY_PENDING",
    grant: "students.moderation",
    linkUrl: "/a/reviews/moderation",
  },
  study: {
    event: "STUDENTS_STUDY_PENDING",
    grant: "students.study",
    linkUrl: "/a/reviews/study",
  },
  "crm-link": {
    event: "STUDENTS_CRM_LINK_REQUESTED",
    grant: "students.moderation",
    linkUrl: "/a/clients/link-requests",
  },
};

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRM_SERVICE_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(token) && safeEqual(token, secret);
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Неверный служебный токен" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { kind?: string; title?: string; body?: string; groupKey?: string }
    | null;
  const mapping = body?.kind ? KIND_TO_EVENT[body.kind] : undefined;
  if (!mapping || !body?.title) {
    return NextResponse.json({ error: "Неизвестное событие" }, { status: 400 });
  }

  const organization = await prisma.organization.findFirst({ select: { id: true } });
  if (!organization) {
    return NextResponse.json({ error: "Организация не настроена" }, { status: 503 });
  }

  await notify({
    organizationId: organization.id,
    userIds: await studentsGrantRecipients(organization.id, mapping.grant),
    event: mapping.event,
    title: body.title,
    body: body.body,
    linkUrl: mapping.linkUrl,
    groupKey: body.groupKey,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
