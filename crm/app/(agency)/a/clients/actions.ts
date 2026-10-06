"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { AccessDeniedError } from "@/lib/access";
import {
  authorize,
  authorizeOrThrow,
  requireAgencyActor,
} from "@/lib/auth/session";
import {
  AgreementError,
  attachAgreementFile,
  confirmAgreement,
  terminateAgreement,
} from "@/lib/services/agreements";
import {
  AccountDeletionError,
  confirmAccountDeletion,
  rejectAccountDeletion,
} from "@/lib/services/account-deletion";
import { deleteContractTemplate, uploadContractTemplate } from "@/lib/services/contract-documents";
import {
  ClientUserError,
  createClient,
  createClientUserAccount,
  resetClientUserPassword,
  revokeClientInvitation,
  updateClient,
} from "@/lib/services/clients";
import { InviteError } from "@/lib/services/invitations";
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

/**
 * Отозвать неотвеченное приглашение, которое администратор клиента
 * отправил коллеге. Агентство само приглашений людям клиента не шлёт
 * (заводит аккаунт с паролем), но список ждущих видит и может убрать
 * ошибочное — например, когда сам администратор клиента этого уже не сделает.
 *
 * Отказ в правах — 404, а не сообщение (BR-28). Соседние действия этого
 * файла отвечают сообщением, и для них это верно: они про клиента,
 * карточку которого человеку уже открыли. Здесь же в форму приходит id
 * приглашения, и ответ «недостаточно прав» на чужой id подтверждал бы,
 * что такое приглашение существует.
 */
export async function revokeClientInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const clientId = String(formData.get("clientId") || "");

  authorize(actor, "client.manage", { clientId });

  try {
    await revokeClientInvitation(actor, String(formData.get("id") || ""));
  } catch (error) {
    // Второй раз то же право, уже на компанию из самого приглашения,
    // а не из формы. Сюда доходит только несовпадение этих двух
    if (error instanceof AccessDeniedError) notFound();
    if (error instanceof InviteError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/a/clients/${clientId}`);
  return {};
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

/** Шаблон договора для клиентов без договора: они скачивают его в «Документах». */
export async function uploadContractTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAgencyActor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите файл" };

  try {
    authorizeOrThrow(actor, "agreement.manage", { clientId: null });
    await uploadContractTemplate(actor, file);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath("/a/settings");
  revalidatePath("/documents");
  return { ok: "Шаблон обновлён — клиенты уже видят новый файл" };
}

/** Убрать шаблон договора: клиенты снова увидят подсказку написать менеджеру. */
export async function deleteContractTemplateAction(): Promise<FormState> {
  const actor = await requireAgencyActor();
  try {
    authorizeOrThrow(actor, "agreement.manage", { clientId: null });
    await deleteContractTemplate(actor);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }
  revalidatePath("/a/settings");
  revalidatePath("/documents");
  return { ok: "Шаблон удалён" };
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

/** Владелец решает по просьбе клиента с договором удалить аккаунт: подтвердить или отклонить. */
export async function decideAccountDeletionAction(
  userId: string,
  clientId: string,
  decision: "confirm" | "reject",
): Promise<FormState> {
  const actor = await requireAgencyActor();
  try {
    authorizeOrThrow(actor, "clientUser.confirmDeletion", { clientId });
    if (decision === "confirm") await confirmAccountDeletion(actor, userId);
    else await rejectAccountDeletion(actor, userId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Подтверждает только владелец" };
    if (error instanceof AccountDeletionError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/a/clients/${clientId}`);
  return { ok: decision === "confirm" ? "Аккаунт удалён" : "Запрос отклонён, клиент уведомлён" };
}
