"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireClientActor } from "@/lib/auth/session";
import { AgreementError } from "@/lib/services/agreements";
import { submitSignedContract } from "@/lib/services/contract-documents";
import { FileValidationError } from "@/lib/storage";

export type ContractUploadState = { error?: string; ok?: string };

/** Клиент присылает подписанный договор (скан или фото) на проверку агентству. */
export async function uploadSignedContractAction(
  _prev: ContractUploadState,
  formData: FormData,
): Promise<ContractUploadState> {
  const actor = await requireClientActor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите файл" };

  try {
    // Договор от имени компании присылает тот, кто вправе принимать условия
    authorizeOrThrow(actor, "agreement.accept", { clientId: actor.clientId });
    await submitSignedContract(actor, file);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Прислать договор может администратор компании" };
    if (error instanceof AgreementError) return { error: error.message };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath("/documents");
  return { ok: "Договор отправлен. Агентство проверит его и подтвердит." };
}
