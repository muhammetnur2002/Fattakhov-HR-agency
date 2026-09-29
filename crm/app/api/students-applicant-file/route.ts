import { NextResponse, type NextRequest } from "next/server";

import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fetchApplicantFile } from "@/lib/students-service";

/**
 * Фото и резюме студента, откликнувшегося на вакансию клиента. Файл берётся с
 * платформы по отклику своей компании (чужой отклик платформа не отдаёт), поэтому
 * клиент видит только тех, кто откликнулся именно ему. Секрет остаётся на сервере.
 */
export async function GET(request: NextRequest) {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return new NextResponse(null, { status: 404 });

  const applicationId = request.nextUrl.searchParams.get("applicationId") ?? "";
  const kind = request.nextUrl.searchParams.get("kind");
  if (!applicationId || (kind !== "photo" && kind !== "resume")) return new NextResponse(null, { status: 400 });

  const user = await prisma.user.findFirst({ where: { id: actor.id }, select: { fullName: true } });
  const upstream = await fetchApplicantFile(actor.clientId, applicationId, kind, user?.fullName ?? "CRM");
  if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
