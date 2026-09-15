import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

/**
 * Проверка живости для балансировщика и мониторинга.
 *
 * Проверяет не «процесс запущен», а «приложение может работать»:
 * без базы платформа бесполезна, и отвечать «всё хорошо» в такой
 * ситуации значит держать в строю экземпляр, который на любой
 * настоящий запрос отдаст ошибку.
 *
 * Наружу не отдаётся ничего, кроме признака готовности: версии,
 * адреса базы и тексты ошибок на публичном адресе - подарок тому,
 * кто изучает, что у вас внутри. Подробности уходят в логи.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[health] база недоступна", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
