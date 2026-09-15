import { NextResponse } from "next/server";

import { canDo, effectiveGrants } from "@/lib/access";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  issueStudentsTicket,
  studentsPermissions,
  studentsSsoSecret,
} from "@/lib/students-sso";
import { appOrigin, studentsUrl } from "@/lib/urls";

/**
 * Переход в панель студенческой платформы.
 *
 * POST, а не ссылка: GET браузер и Next могли бы запросить заранее,
 * выпуская билеты входа без нажатия. Отказ — 404, как у всех прав
 * в кабинете (BR-28).
 */
export async function POST(request: Request) {
  // Форма своя: чужая страница не должна выпускать билет от имени вошедшего
  const origin = request.headers.get("origin");
  if (origin && !sameHost(origin, request.headers.get("host"))) {
    return new NextResponse(null, { status: 403 });
  }

  const actor = await getActor();
  if (!actor || !canDo(actor, "students.enter")) {
    return new NextResponse(null, { status: 404 });
  }

  const secret = studentsSsoSecret();
  const target = studentsUrl("/api/auth/crm");
  if (!secret || !target) {
    return NextResponse.redirect(new URL("/a/students?error=config", appOrigin()), 303);
  }

  const permissions = studentsPermissions(effectiveGrants(actor));
  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: { email: true, fullName: true, position: true },
  });
  if (!user || permissions.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  const ticket = issueStudentsTicket(
    {
      userId: actor.id,
      email: user.email,
      name: user.fullName,
      position: user.position,
      permissions,
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
