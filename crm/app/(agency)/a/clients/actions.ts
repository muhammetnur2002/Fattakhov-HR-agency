"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import {
  AgreementError,
  attachAgreementFile,
  confirmAgreement,
  terminateAgreement,
} from "@/lib/services/agreements";
import {
  ClientUserError,
  createClient,
  createClientUserAccount,
  resetClientUserPassword,
  updateClient,
} from "@/lib/services/clients";
import { FileValidationError } from "@/lib/storage";
import {
  clientSchema,
  createClientUserSchema,
  resetClientUserPasswordSchema,
} from "@/lib/validation/client";

export type FormState = { error?: string; ok?: string };

/** Приводит поля формы к объекту для zod. */
function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

export async function createClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();

  const parsed = clientSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  let clientId: string;
  try {
    authorizeOrThrow(actor, "client.manage");
    ({ id: clientId } = await createClient(actor, parsed.data));
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав для создания клиента" };
    }
    throw error;
  }

  revalidatePath("/a/clients");
  redirect(`/a/clients/${clientId}`);
}

export async function updateClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const clientId = String(formData.get("clientId") || "");

  const parsed = clientSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    authorizeOrThrow(actor, "client.manage", { clientId });
    const updated = await updateClient(actor, clientId, parsed.data);
    if (!updated) return { error: "Клиент не найден" };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return { ok: "Изменения сохранены" };
}

/**
 * Аккаунт пользователя клиента. Пароль задаёт аккаунт-менеджер и сообщает
 * его человеку лично — ссылка-приглашение здесь не нужна, вход возможен
 * сразу же.
 */
export async function createClientUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const clientId = String(formData.get("clientId") || "");

  const parsed = createClientUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    authorizeOrThrow(actor, "client.manage", { clientId });

    await createClientUserAccount({
      organizationId: actor.organizationId,
      clientId,
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
      role: parsed.data.role,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    if (error instanceof ClientUserError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return {
    ok: `Аккаунт для ${parsed.data.email} создан — сообщите почту и пароль лично`,
  };
}

export async function resetClientUserPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const clientId = String(formData.get("clientId") || "");

  const parsed = resetClientUserPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    authorizeOrThrow(actor, "client.manage", { clientId });

    await resetClientUserPassword({
      organizationId: actor.organizationId,
      clientId,
      userId: parsed.data.userId,
      password: parsed.data.password,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    if (error instanceof ClientUserError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return { ok: "Пароль обновлён — сообщите его клиенту лично" };
}

export async function confirmAgreementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const agreementId = String(formData.get("agreementId") || "");
  const clientId = String(formData.get("clientId") || "");

  try {
    authorizeOrThrow(actor, "agreement.manage", { clientId });
    await confirmAgreement(actor, agreementId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    if (error instanceof AgreementError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return { ok: "Условия подтверждены, клиент активен" };
}

export async function terminateAgreementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const agreementId = String(formData.get("agreementId") || "");
  const clientId = String(formData.get("clientId") || "");

  try {
    authorizeOrThrow(actor, "agreement.manage", { clientId });
    await terminateAgreement(actor, agreementId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { error: "Недостаточно прав" };
    }
    if (error instanceof AgreementError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return { ok: "Договор расторгнут" };
}

/** Прикрепление скана подписанного договора — клиент видит его в «Документах». */
export async function attachAgreementFileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const agreementId = String(formData.get("agreementId") || "");
  const clientId = String(formData.get("clientId") || "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл" };
  }

  try {
    authorizeOrThrow(actor, "agreement.manage", { clientId });
    await attachAgreementFile(actor, { agreementId, file });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof AgreementError) return { error: error.message };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  revalidatePath("/documents");
  return { ok: "Договор прикреплён" };
}
