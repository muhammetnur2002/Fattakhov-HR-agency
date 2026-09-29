import { NextResponse, type NextRequest } from "next/server";

import { canDo, effectiveGrants } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { fetchStudentsFile } from "@/lib/students-service";

/** Картинка компании (логотип, обложка вакансии): не персональные данные, её видит любой студент. */
const COMPANY_IMAGE_PATH = /^\/api\/files\/company\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/**
 * Проксирует файл со студенческой платформы для CRM: читает его служебным
 * секретом на сервере и отдаёт браузеру — секрет так и не попадает в браузер,
 * а <img>/<a> получают обычную ссылку.
 *
 * Справка студента и фото на модерации — персональные данные, право смотреть
 * их не шире права их проверять. Картинки компании (обложка вакансии в форме
 * клиента) доступны и клиенту со студенческой платформой.
 */
export async function GET(request: NextRequest) {
  const actor = await requireActor();

  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!path.startsWith("/api/files/")) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }

  const grants = effectiveGrants(actor);
  const canReview = grants.includes("students.moderation") || grants.includes("students.study");
  const canSeeCompanyImage =
    canReview || (COMPANY_IMAGE_PATH.test(path) && canDo(actor, "students.enterAsClient"));
  if (!canSeeCompanyImage) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
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
