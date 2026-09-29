import { NextResponse, type NextRequest } from "next/server";

import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { rejectForeignOrOversized } from "@/lib/security/request-guard";
import { uploadVacancyCover } from "@/lib/students-service";

/**
 * Загрузка обложки вакансии из формы клиента. Файл идёт на платформу
 * серверным вызовом, а в форму возвращается только адрес, который потом
 * сохраняется вместе с вакансией.
 */
export async function POST(request: NextRequest) {
  const rejected = rejectForeignOrOversized(request, { upload: true });
  if (rejected) return rejected;
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return NextResponse.json({ error: "Кабинет не привязан к компании" }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

  const user = await prisma.user.findFirst({ where: { id: actor.id }, select: { fullName: true } });
  const result = await uploadVacancyCover(actor.clientId, file, user?.fullName ?? "CRM");
  if (!result.url) return NextResponse.json({ error: result.error ?? "Не удалось загрузить картинку" }, { status: 400 });
  return NextResponse.json({ url: result.url }, { status: 201 });
}
