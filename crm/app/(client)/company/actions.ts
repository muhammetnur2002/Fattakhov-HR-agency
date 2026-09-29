"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { companyProfileSchema, updateCompanyProfile } from "@/lib/services/company-profile";
import { pushCompanyProfile } from "@/lib/services/company-sync";

export type CompanyProfileState = { error?: string; ok?: string; fields?: Record<string, string> };

/** Сохранить профиль компании и передать его на студенческую платформу. */
export async function saveCompanyProfileAction(
  _prev: CompanyProfileState,
  formData: FormData,
): Promise<CompanyProfileState> {
  const actor = await requireClientActor();
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { error: "Проверьте заполнение полей", fields };
  }

  try {
    authorizeOrThrow(actor, "org.manageClientUsers", { clientId: actor.clientId });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Профиль компании правит администратор" };
    throw error;
  }

  await updateCompanyProfile(actor.clientId, parsed.data);

  // ИНН уникален на платформе: если он уже занят, вакансию потом не проверить — говорим сразу
  const user = await prisma.user.findFirst({ where: { id: actor.id }, select: { fullName: true } });
  const sync = await pushCompanyProfile(actor.clientId, user?.fullName ?? "CRM");
  revalidatePath("/company");
  if (sync?.code === "INN_EXISTS") {
    return { error: sync.error, fields: { inn: "Этот ИНН уже указан у другой компании" } };
  }
  if (sync) {
    return { ok: "Профиль сохранён. На студенческую платформу он пока не передался — повторится при публикации вакансии." };
  }
  return { ok: "Профиль сохранён" };
}
