import { NextResponse } from "next/server";

import { canDo } from "@/lib/access";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { issueClientTicket, studentsSsoSecret } from "@/lib/students-sso";
import { appOrigin, studentsUrl } from "@/lib/urls";

/**
 * Переход клиента на студенческую платформу — публикация вакансии от
 * имени уже проверенной агентством компании (Employer.crmClientId).
 *
 * POST, а не ссылка: по тем же причинам, что и у входа сотрудника
 * (app/(agency)/a/students/open/route.ts) — GET браузер мог бы запросить
 * заранее и выпустить билет входа без нажатия.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !sameHost(origin, request.headers.get("host"))) {
    return new NextResponse(null, { status: 403 });
  }

  const actor = await getActor();
  if (!actor || !actor.clientId || !canDo(actor, "students.enterAsClient")) {
    return new NextResponse(null, { status: 404 });
  }

  const secret = studentsSsoSecret();
  const target = studentsUrl("/api/auth/crm");
  if (!secret || !target) {
    return NextResponse.redirect(new URL("/students?error=config", appOrigin()), 303);
  }

  const [user, client] = await Promise.all([
    prisma.user.findFirst({
      where: { id: actor.id },
      select: { email: true, fullName: true },
    }),
    prisma.client.findFirst({
      where: { id: actor.clientId },
      select: { name: true },
    }),
  ]);
  if (!user || !client) {
    return new NextResponse(null, { status: 404 });
  }

  const ticket = issueClientTicket(
    {
      userId: actor.id,
      crmClientId: actor.clientId,
      companyName: client.name,
      contactName: user.fullName,
      contactEmail: user.email,
    },
    secret,
  );
  return NextResponse.redirect(`${target}?ticket=${encodeURIComponent(ticket)}`, 303);
}

function sameHost(origin: string, host: string | null): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
