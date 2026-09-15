import { NextResponse, type NextRequest } from "next/server";

import { visibleAttachmentsFilter } from "@/lib/access";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage/client";
import { verifySignedUrl } from "@/lib/storage/signing";

/**
 * Ссылка на файл живёт 15 минут (BR-37) — самый вероятный способ сюда
 * попасть не ошибка, а открытая заранее вкладка или письмо, до которого
 * дошли руки позже. Голый текст без оформления браузера здесь читается
 * как «сайт сломан», поэтому у отказа есть здесь своя маленькая страница,
 * не карточка приложения целиком: это конец цепочки редиректов, а не
 * место, куда встраивать сайдбар и авторизацию.
 */
function errorPage(message: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ссылка недоступна</title>
<style>
  body { margin:0; min-height:100svh; display:flex; align-items:center; justify-content:center;
    background:#323537; color:#f3f4f5; font:15px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; padding:24px; }
  .card { max-width:360px; text-align:center; }
  h1 { font-size:17px; font-weight:600; margin:0 0 8px; }
  p { margin:0; color:#b8bcc0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${message}</h1>
    <p>Если ссылку прислали давно — откройте страницу заново в кабинете, там она соберётся свежая.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Отдача файлов.
 *
 * Три барьера подряд, и все нужны:
 *  1. подпись ссылки (BR-37) — отсекает подобранные и просроченные URL;
 *  2. сессия и фильтр видимости — подпись сама по себе не даёт права,
 *     иначе пересланная ссылка открыла бы резюме постороннему;
 *  3. запись в журнал доступа к ПДн (BR-36).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const key = searchParams.get("key");
  const exp = searchParams.get("exp");
  const sig = searchParams.get("sig");

  if (!key || !exp || !sig) {
    return errorPage("Некорректная ссылка", 400);
  }

  if (!verifySignedUrl({ key, exp, sig })) {
    return errorPage("Ссылка устарела", 403);
  }

  const actor = await getActor();
  if (!actor) return errorPage("Нужно войти в кабинет", 401);

  // Тот же фильтр видимости, что и везде: клиенту не отдаём вложения
  // с внутренней видимостью, даже если он как-то получил ссылку
  const attachment = await prisma.attachment.findFirst({
    where: { storageKey: key, ...visibleAttachmentsFilter(actor) },
    select: {
      fileName: true,
      mimeType: true,
      candidateId: true,
      storageKey: true,
    },
  });

  // 404, а не 403: не подтверждаем существование файла (BR-28)
  if (!attachment) return errorPage("Файл не найден", 404);

  if (attachment.candidateId) {
    await prisma.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId: attachment.candidateId,
        action: "download_file",
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      },
    });
  }

  let body: Buffer;
  try {
    body = await getStorage().get(key);
  } catch {
    return errorPage("Файл недоступен", 404);
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": attachment.mimeType,
      // inline — чтобы резюме открывалось во встроенном просмотрщике,
      // а не скачивалось: клиент смотрит десятки штук подряд
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
