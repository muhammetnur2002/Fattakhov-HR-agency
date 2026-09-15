import type { Actor } from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type { InvoiceStatus } from "@/lib/generated/prisma/enums";
import { describePricing, feePerHire } from "@/lib/pricing";
import { toPricingParams } from "@/lib/services/agreements";
import { canTransition, InvoiceError } from "@/lib/services/invoice-status";
import { buildStorageKey, validateUpload } from "@/lib/storage";
import { getStorage } from "@/lib/storage/client";
import { buildSignedUrl } from "@/lib/storage/signing";

export { InvoiceError };

/** Отсрочка платежа по умолчанию, если в договоре не указана иная. */
const DEFAULT_PAYMENT_DAYS = 14;

export type BillableHire = {
  applicationId: string;
  vacancyId: string;
  vacancyNumber: number;
  vacancyTitle: string;
  clientId: string;
  clientName: string;
  candidateName: string;
  hiredAt: Date;
  /** Фактический оффер — база расчёта по BR-31. */
  offerSalary: number | null;
  /** Вознаграждение по действующему договору. */
  fee: number | null;
  pricingDescription: string;
  /** Уже выставлен ли счёт по этой вакансии. */
  invoiced: boolean;
};

/**
 * Закрытые наймом позиции, за которые пора выставить счёт.
 *
 * BR-31: вознаграждение считается от ФАКТИЧЕСКОГО оффера
 * (`Application.offerSalary`), а не от вилки в брифе. Вилка — намерение,
 * оффер — то, о чём договорились; считать по вилке значит выставлять
 * счёт за деньги, которых никто не платит.
 */
export async function listBillableHires(
  actor: Actor,
  clientId?: string,
): Promise<BillableHire[]> {
  const hires = await prisma.application.findMany({
    where: {
      organizationId: actor.organizationId,
      outcome: "HIRED",
      hiredAt: { not: null },
      ...(clientId && { vacancy: { clientId } }),
    },
    orderBy: { hiredAt: "desc" },
    select: {
      id: true,
      hiredAt: true,
      offerSalary: true,
      candidate: { select: { fullName: true } },
      vacancy: {
        select: {
          id: true,
          number: true,
          title: true,
          clientId: true,
          client: { select: { name: true } },
        },
      },
    },
  });

  if (hires.length === 0) return [];

  // Договоры тянем разом: у каждого клиента он свой
  const agreements = await prisma.agreement.findMany({
    where: {
      clientId: { in: [...new Set(hires.map((h) => h.vacancy.clientId))] },
      status: "ACTIVE",
    },
  });
  const agreementByClient = new Map(agreements.map((a) => [a.clientId, a]));

  // Какие вакансии уже в счетах
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: actor.organizationId,
      status: { not: "CANCELLED" },
    },
    select: { vacancyIds: true },
  });
  const invoicedVacancies = new Set(invoices.flatMap((i) => i.vacancyIds));

  return hires.map((hire) => {
    const agreement = agreementByClient.get(hire.vacancy.clientId);
    const offerSalary =
      hire.offerSalary === null ? null : Number(hire.offerSalary);

    const fee =
      agreement && offerSalary !== null
        ? feePerHire(toPricingParams(agreement), { monthlySalary: offerSalary })
        : null;

    return {
      applicationId: hire.id,
      vacancyId: hire.vacancy.id,
      vacancyNumber: hire.vacancy.number,
      vacancyTitle: hire.vacancy.title,
      clientId: hire.vacancy.clientId,
      clientName: hire.vacancy.client.name,
      candidateName: hire.candidate.fullName,
      hiredAt: hire.hiredAt!,
      offerSalary,
      fee,
      pricingDescription: agreement
        ? describePricing(toPricingParams(agreement))
        : "Нет действующего договора",
      invoiced: invoicedVacancies.has(hire.vacancy.id),
    };
  });
}

/**
 * Сквозная нумерация счетов в рамках организации.
 *
 * Устроена ровно так же, как нумерация вакансий (nextVacancyNumber
 * в services/vacancies): блокировка строки организации внутри
 * транзакции сериализует одновременные выписки. Без неё два счёта,
 * выписанных в одну секунду, читали одно и то же «последнее» число
 * и получали один номер — на восьми одновременных вставках различных
 * номеров выходило три. Для бухгалтерии два документа с одним номером
 * не мелкая неточность, а испорченная отчётность.
 *
 * Уникальный индекс в схеме при этом всё равно нужен: блокировка
 * защищает только тех, кто её берёт, а индекс — всех и навсегда.
 *
 * Номер считается от наибольшего выданного, а не от количества счетов.
 * Количество совпадает с максимумом, только пока в нумерации нет дырок;
 * стоит появиться любой — и «количество + 1» указывает на номер, уже
 * занятый другим документом.
 */
async function nextInvoiceNumber(
  tx: Parameters<Parameters<typeof prismaRaw.$transaction>[0]>[0],
  organizationId: string,
): Promise<string> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;

  const year = new Date().getFullYear();
  const suffix = `/${year}`;

  const issued = await tx.invoice.findMany({
    where: { organizationId, number: { endsWith: suffix } },
    select: { number: true },
  });

  const max = issued.reduce((highest, { number }) => {
    const value = Number.parseInt(number, 10);
    return Number.isFinite(value) && value > highest ? value : highest;
  }, 0);

  return `${max + 1}${suffix}`;
}

export async function createInvoice(
  actor: Actor,
  params: {
    clientId: string;
    amount: number;
    description?: string;
    vacancyIds: string[];
    dueInDays?: number;
  },
) {
  if (params.amount <= 0) {
    throw new InvoiceError("Сумма счёта должна быть больше нуля");
  }

  const client = await prisma.client.findFirst({
    where: { id: params.clientId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!client) throw new InvoiceError("Клиент не найден");

  const agreement = await prisma.agreement.findFirst({
    where: { clientId: params.clientId, status: "ACTIVE" },
    select: { id: true },
  });

  return prismaRaw.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, actor.organizationId);

    return tx.invoice.create({
      data: {
        organizationId: actor.organizationId,
        clientId: params.clientId,
        agreementId: agreement?.id,
        number,
        status: "DRAFT",
        amount: params.amount,
        description: params.description,
        vacancyIds: params.vacancyIds,
        createdById: actor.id,
      },
      select: { id: true, number: true },
    });
  });
}

/**
 * Смена статуса счёта.
 *
 * Единственная точка: правила переходов проверяются здесь, а не
 * в интерфейсе. Счёт — документ про деньги, «поправить статус руками»
 * быть не должно.
 */
export async function transitionInvoice(
  actor: Actor,
  invoiceId: string,
  to: InvoiceStatus,
  options: { dueInDays?: number } = {},
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId: actor.organizationId },
    select: { id: true, status: true, clientId: true, number: true, amount: true },
  });
  if (!invoice) throw new InvoiceError("Счёт не найден");

  if (!canTransition(invoice.status, to)) {
    throw new InvoiceError(
      `Из «${invoice.status}» в «${to}» счёт не переводится`,
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (to === "ISSUED") {
    data.issuedAt = now;
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + (options.dueInDays ?? DEFAULT_PAYMENT_DAYS));
    data.dueAt = dueAt;
  }

  if (to === "PAID") data.paidAt = now;

  await prisma.invoice.update({ where: { id: invoiceId }, data });

  return { from: invoice.status, to, invoice };
}

export type InvoiceView = {
  id: string;
  number: string;
  status: InvoiceStatus;
  amount: number;
  description: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  clientName: string;
  /** Дней просрочки. Отрицательное — ещё есть время. */
  daysOverdue: number | null;
  /** Подписанные ссылки на последний загруженный файл счёта/акта — не хранятся, считаются на лету (BR-37). */
  invoiceFileUrl: string | null;
  actFileUrl: string | null;
};

export async function listInvoices(
  actor: Actor,
  filters: { clientId?: string; status?: InvoiceStatus } = {},
): Promise<InvoiceView[]> {
  // Клиент видит только свои счета
  const clientId =
    actor.clientId !== null ? actor.clientId : filters.clientId;

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(clientId && { clientId }),
      ...(filters.status && { status: filters.status }),
      // Черновик — внутренний документ, клиенту его не показываем
      ...(actor.clientId !== null && { status: { not: "DRAFT" } }),
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      number: true,
      status: true,
      amount: true,
      description: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      client: { select: { name: true } },
      attachments: {
        where: { deletedAt: null, kind: { in: ["INVOICE", "ACT"] } },
        orderBy: { createdAt: "desc" },
        select: { kind: true, storageKey: true },
      },
    },
  });

  const now = new Date();

  return invoices.map((invoice) => {
    // Последний загруженный файл каждого вида — перезалили, старый молча заменился
    const invoiceFile = invoice.attachments.find((a) => a.kind === "INVOICE");
    const actFile = invoice.attachments.find((a) => a.kind === "ACT");

    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount: Number(invoice.amount),
      description: invoice.description,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      clientName: invoice.client.name,
      daysOverdue:
        invoice.dueAt && invoice.status !== "PAID"
          ? Math.floor((now.getTime() - invoice.dueAt.getTime()) / 86_400_000)
          : null,
      invoiceFileUrl: invoiceFile ? buildSignedUrl(invoiceFile.storageKey) : null,
      actFileUrl: actFile ? buildSignedUrl(actFile.storageKey) : null,
    };
  });
}

/**
 * Прикрепить счёт или акт к записи (BR-37: файл только через подписанную
 * ссылку, поэтому здесь хранится не URL, а вложение в общем хранилище —
 * ровно тот же путь, что у резюме).
 *
 * Повторная загрузка не удаляет старый файл, а добавляет новый: старый
 * просто перестаёт быть «последним» и не отдаётся ссылкой. Так отзыв
 * ошибочно прикреплённого файла не роняет ссылку, которая уже могла
 * уйти клиенту.
 */
export async function attachInvoiceFile(
  actor: Actor,
  params: {
    invoiceId: string;
    file: File;
    kind: "INVOICE" | "ACT";
  },
): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, organizationId: actor.organizationId },
    select: { id: true, clientId: true },
  });
  if (!invoice) throw new InvoiceError("Счёт не найден");

  const body = Buffer.from(await params.file.arrayBuffer());
  validateUpload({ size: params.file.size, type: params.file.type, body });

  const storageKey = buildStorageKey({
    organizationId: actor.organizationId,
    scope: "invoices",
    scopeId: invoice.id,
    fileName: params.file.name,
  });

  await getStorage().put({ key: storageKey, body, mimeType: params.file.type });

  await prisma.attachment.create({
    data: {
      organizationId: actor.organizationId,
      kind: params.kind,
      fileName: params.file.name,
      fileSize: params.file.size,
      mimeType: params.file.type,
      storageKey,
      // Счёт и акт для того и грузятся, чтобы клиент их скачал
      visibility: "SHARED",
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      uploadedById: actor.id,
    },
  });
}

export type Receivables = {
  total: number;
  overdue: number;
  count: number;
  overdueCount: number;
};

/** Дебиторка: сколько денег в пути и сколько из них просрочено. */
export async function receivables(actor: Actor): Promise<Receivables> {
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: actor.organizationId,
      status: { in: ["ISSUED", "OVERDUE"] },
    },
    select: { amount: true, status: true },
  });

  let total = 0;
  let overdue = 0;
  let overdueCount = 0;

  for (const invoice of invoices) {
    const amount = Number(invoice.amount);
    total += amount;
    if (invoice.status === "OVERDUE") {
      overdue += amount;
      overdueCount++;
    }
  }

  return { total, overdue, count: invoices.length, overdueCount };
}
