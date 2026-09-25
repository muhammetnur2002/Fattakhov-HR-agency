import { NextResponse, type NextRequest } from "next/server";

import { effectiveGrants } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { fetchStudentsFile } from "@/lib/students-service";

/**
 * Проксирует файл со студенческой платформы (фото, справка) для «Проверок»:
 * читает его служебным секретом на сервере и отдаёт браузеру сотрудника —
 * секрет так и не попадает в браузер, а <img>/<a> получают обычную ссылку.
 *
 * Доступ — как у самих «Проверок»: справка студента и фото на модерации
 * — персональные данные, право смотреть их не шире права их проверять.
 */
export async function GET(request: NextRequest) {
  const actor = await requireAgencyActor();
  const grants = effectiveGrants(actor);
  if (!grants.includes("students.moderation") && !grants.includes("students.study")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!path.startsWith("/api/files/")) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }

  const upstream = await fetchStudentsFile(path);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
