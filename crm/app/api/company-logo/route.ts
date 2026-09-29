import { NextResponse, type NextRequest } from "next/server";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CompanyProfileError, removeCompanyLogo, saveCompanyLogo } from "@/lib/services/company-profile";
import { pushCompanyProfile } from "@/lib/services/company-sync";
import { FileValidationError } from "@/lib/storage";
import { uploadVacancyCover } from "@/lib/students-service";

async function currentClient() {
  const actor = await requireClientActor();
  if (!actor.clientId) throw new CompanyProfileError("Кабинет не привязан к компании");
  authorizeOrThrow(actor, "org.manageClientUsers", { clientId: actor.clientId });
  const user = await prisma.user.findFirst({ where: { id: actor.id }, select: { fullName: true } });
  return { actor, clientId: actor.clientId, label: user?.fullName ?? "CRM" };
}

function failure(error: unknown) {
  if (error instanceof AccessDeniedError) {
    return NextResponse.json({ error: "Логотип меняет администратор" }, { status: 403 });
  }
  if (error instanceof CompanyProfileError || error instanceof FileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

/** Загрузка логотипа: сохраняем у себя и передаём копию на платформу для карточки вакансии. */
export async function POST(request: NextRequest) {
  try {
    const { actor, clientId, label } = await currentClient();
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    const url = await saveCompanyLogo(actor, clientId, file);
    // Копия на платформе нужна студентам и проверке; сбой не отменяет сохранённый логотип
    const uploaded = await uploadVacancyCover(clientId, file, label).catch(() => ({ url: undefined }));
    if (uploaded.url) await pushCompanyProfile(clientId, label, uploaded.url).catch(() => null);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE() {
  try {
    const { clientId, label } = await currentClient();
    await removeCompanyLogo(clientId);
    await pushCompanyProfile(clientId, label, null).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
