"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import type { FormState } from "@/lib/form-state";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { companyProfileSchema, updateCompanyProfile } from "@/lib/services/company-profile";
import { pushCompanyProfile } from "@/lib/services/company-sync";
import { invalidForm } from "@/lib/validation/form-errors";

export type CompanyProfileState = FormState;

/** Сохранить профиль компании и передать его на студенческую платформу. */
export async function saveCompanyProfileAction(
  _prev: CompanyProfileState,
  formData: FormData,
): Promise<CompanyProfileState> {
  const actor = await requireClientActor();
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalidForm(parsed.error);

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
