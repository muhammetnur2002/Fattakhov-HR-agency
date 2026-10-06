import { NextResponse, type NextRequest } from "next/server";

import { canDo, effectiveGrants } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";
import { recordStudentFileRead, studentFileIdFromPath } from "@/lib/services/student-file-audit";
import { fetchStudentsFile } from "@/lib/students-service";

/** Картинка компании (логотип, обложка вакансии): не персональные данные, её видит любой студент. */
const COMPANY_IMAGE_PATH = /^\/api\/files\/company\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/** Справка, фото студента и картинка компании — единственное, что проверяющим нужно из хранилища. */
const REVIEW_FILE_PATH = /^\/api\/files\/(photo|study|company)\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

/**
 * Проксирует файл со студенческой платформы для CRM: читает его служебным
 * секретом на сервере и отдаёт браузеру — секрет так и не попадает в браузер,
 * а <img>/<a> получают обычную ссылку.
 *
 * Справка студента и фото на модерации — персональные данные, право смотреть
 * их не шире права их проверять. Картинки компании (обложка вакансии в форме
 * клиента) доступны и клиенту со студенческой платформой.
 *
 * Каждое чтение справки или фото студента пишется в журнал доступа к ПДн
 * (lib/services/student-file-audit.ts): без записи сотрудник открывал бы
 * любой документ без следа. Картинки компании — не персональные данные,
 * их в журнал не пишем. Запись идёт в фоне и выдачу файла не задерживает.
 */
export async function GET(request: NextRequest) {
  const actor = await requireActor();

  const path = request.nextUrl.searchParams.get("path") ?? "";
  // Строго один файл: свободный путь со служебным секретом открыл бы и другие маршруты платформы
  if (!REVIEW_FILE_PATH.test(path)) {
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

  const studentFileId = studentFileIdFromPath(path);
  if (studentFileId) {
    const kind = path.startsWith("/api/files/study/") ? "study" : "photo";
    // Сама функция не бросает; catch — страховка, чтобы журнал ни при каких условиях не уронил выдачу
    recordStudentFileRead(actor, { kind, objectId: studentFileId }, request.headers).catch(() => {});
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
