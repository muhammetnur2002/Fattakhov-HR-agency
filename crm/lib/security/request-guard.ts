import { NextResponse } from "next/server";

/** Размер файла, который принимают маршруты загрузки; запас — на служебные поля формы. */
const UPLOAD_BODY_LIMIT = 5 * 1024 * 1024;

function sameHost(origin: string, host: string | null): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Защита маршрутов, которые меняют данные по одной куке сессии: запрос должен прийти
 * с нашей же страницы, и тело не должно быть огромным. Возвращает готовый отказ или null.
 */
export function rejectForeignOrOversized(request: Request, options: { upload?: boolean } = {}): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin && !sameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (options.upload) {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declared) || declared > UPLOAD_BODY_LIMIT) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
    }
  }
  return null;
}
