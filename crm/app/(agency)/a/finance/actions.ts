"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import type { InvoiceStatus } from "@/lib/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/pricing";
import {
  attachInvoiceFile,
  createInvoice,
  InvoiceError,
  transitionInvoice,
} from "@/lib/services/invoices";
import { FileValidationError } from "@/lib/storage";

export type FinanceState = { error?: string; ok?: string };

export async function createInvoiceAction(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const actor = await requireAgencyActor();
  const clientId = String(formData.get("clientId") || "");

  const amount = Number(formData.get("amount") || 0);
  const vacancyIds = formData
    .getAll("vacancyIds")
    .map(String)
    .filter(Boolean);

  try {
    authorizeOrThrow(actor, "invoice.manage", { clientId });
    await createInvoice(actor, {
      clientId,
      amount,
      description: String(formData.get("description") || "") || undefined,
      vacancyIds,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof InvoiceError) return { error: error.message };
    throw error;
  }

  revalidatePath("/a/finance");
  return { ok: "Счёт создан черновиком — проверьте и выставьте" };
}

/**
 * Смена статуса счёта.
 *
 * Выставление уведомляет клиента: счёт, о котором он не знает, —
 * это просроченный счёт через две недели.
 */
export async function transitionInvoiceAction(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const actor = await requireAgencyActor();
  const invoiceId = String(formData.get("invoiceId") || "");
  const to = String(formData.get("to") || "") as InvoiceStatus;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId: actor.organizationId },
    select: { clientId: true },
  });
  if (!invoice) return { error: "Счёт не найден" };

  try {
    authorizeOrThrow(actor, "invoice.manage", { clientId: invoice.clientId });
    const result = await transitionInvoice(actor, invoiceId, to);

    if (to === "ISSUED") {
      const recipients = await prisma.user.findMany({
        where: {
          clientId: invoice.clientId,
          role: "CLIENT_ADMIN",
          isActive: true,
        },
        select: { id: true },
      });

      await notify({
        organizationId: actor.organizationId,
        userIds: recipients.map((u) => u.id),
        event: "INVOICE_ISSUED",
        title: `Счёт №${result.invoice.number} на ${formatMoney(Number(result.invoice.amount))}`,
        body: "Документ доступен в разделе «Документы».",
        linkUrl: "/documents",
      });
    }
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof InvoiceError) return { error: error.message };
    throw error;
  }

  revalidatePath("/a/finance");
  revalidatePath("/documents");
  return { ok: "Готово" };
}

/** Прикрепление PDF счёта или подписанного акта — клиент видит их в «Документах». */
export async function attachInvoiceFileAction(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const actor = await requireAgencyActor();
  const invoiceId = String(formData.get("invoiceId") || "");
  const kind = String(formData.get("kind") || "") as "INVOICE" | "ACT";
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл" };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId: actor.organizationId },
    select: { clientId: true },
  });
  if (!invoice) return { error: "Счёт не найден" };

  try {
    authorizeOrThrow(actor, "invoice.manage", { clientId: invoice.clientId });
    await attachInvoiceFile(actor, { invoiceId, file, kind });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof InvoiceError) return { error: error.message };
    if (error instanceof FileValidationError) return { error: error.message };
    throw error;
  }

  revalidatePath("/a/finance");
  revalidatePath("/documents");
  return { ok: kind === "INVOICE" ? "Счёт прикреплён" : "Акт прикреплён" };
}
