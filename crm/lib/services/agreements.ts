import type { Actor } from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format-date";
import { findPreset, type PricingParams } from "@/lib/pricing";
import { buildStorageKey, validateUpload } from "@/lib/storage";
import { getStorage } from "@/lib/storage/client";
import { buildSignedUrl } from "@/lib/storage/signing";

export class AgreementError extends Error {}

/** Действующие условия клиента. От них зависит запуск вакансий (BR-1). */
export async function getActiveAgreement(clientId: string) {
  return prisma.agreement.findFirst({
    where: { clientId, status: "ACTIVE" },
    orderBy: { startsAt: "desc" },
  });
}

/**
 * Прикрепить скан подписанного договора.
 *
 * Через общее хранилище вложений (BR-37 — подписанная ссылка, не голый
 * URL), тем же путём, что и счета: `Agreement.fileUrl` — старое поле под
 * простую внешнюю ссылку, оставлено в схеме, но новый файл живёт здесь.
 */
export async function attachAgreementFile(
  actor: Actor,
  params: { agreementId: string; file: File },
): Promise<void> {
  const agreement = await prisma.agreement.findFirst({
    where: { id: params.agreementId, organizationId: actor.organizationId },
    select: { id: true, clientId: true },
  });
  if (!agreement) throw new AgreementError("Договор не найден");

  const body = Buffer.from(await params.file.arrayBuffer());
  validateUpload({ size: params.file.size, type: params.file.type, body });

  const storageKey = buildStorageKey({
    organizationId: actor.organizationId,
    scope: "agreements",
    scopeId: agreement.id,
    fileName: params.file.name,
  });

  await getStorage().put({ key: storageKey, body, mimeType: params.file.type });

  await prisma.attachment.create({
    data: {
      organizationId: actor.organizationId,
      kind: "CONTRACT",
      fileName: params.file.name,
      fileSize: params.file.size,
      mimeType: params.file.type,
      storageKey,
      // Скан договора для того и грузится, чтобы клиент его скачал
      visibility: "SHARED",
      agreementId: agreement.id,
      clientId: agreement.clientId,
      uploadedById: actor.id,
    },
  });
}

/** Подписанная ссылка на последний загруженный скан договора, если есть. */
export async function getAgreementFileUrl(
  agreementId: string,
): Promise<string | null> {
  const file = await prisma.attachment.findFirst({
    where: { agreementId, kind: "CONTRACT", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { storageKey: true },
  });
  return file ? buildSignedUrl(file.storageKey) : null;
}

/**
 * Есть ли у клиента хоть какие-то условия — действующие или ждущие
 * подтверждения. По этому признаку клиента отправляют в онбординг.
 */
export async function hasAgreement(clientId: string): Promise<boolean> {
  const count = await prisma.agreement.count({
    where: { clientId, status: { in: ["ACTIVE", "PENDING"] } },
  });
  return count > 0;
}

/**
 * Клиент выбрал условия в онбординге.
 *
 * Договор создаётся в статусе PENDING: выбор клиента — это ещё не сделка,
 * агентство должно его подтвердить (сценарий A, шаг 4).
 */
export async function acceptTariff(params: {
  organizationId: string;
  clientId: string;
  presetKey: string;
  acceptedByUserId: string;
}) {
  const preset = findPreset(params.presetKey);
  if (!preset) throw new AgreementError("Неизвестный тариф");

  /*
    Проверка «условия уже выбраны» и создание — под одним замком.

    Порознь между ними помещался второй такой же вызов: два нажатия
    «Выбрать тариф» подряд создавали клиенту два договора, оба
    с одинаковым номером. Дальше подтверждение обоих давало два
    действующих договора на одного клиента, а getActiveAgreement берёт
    findFirst — то есть цена найма начинала считаться по произвольному
    из двух. Для денег это худший вид ошибки: молчаливый и правдоподобный.

    Замок берётся на строке организации — так же, как при выдаче номера
    вакансии (nextVacancyNumber) и счёта (nextInvoiceNumber). Он же
    сериализует нумерацию: договоры нумеруются сквозь всю организацию,
    и замка на клиенте для этого не хватило бы.

    Счёт количеством здесь честен: договоры не удаляют, их расторгают
    статусом, и дырок в нумерации не появляется.
  */
  return prismaRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${params.organizationId} FOR UPDATE`;

    const existing = await tx.agreement.findFirst({
      where: {
        clientId: params.clientId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new AgreementError("Условия сотрудничества уже выбраны");
    }

    const number =
      (await tx.agreement.count({
        where: { organizationId: params.organizationId },
      })) + 1;

    const now = new Date();

    return tx.agreement.create({
      data: {
        organizationId: params.organizationId,
        clientId: params.clientId,
        title: `Договор №${number} от ${formatDate(now)}`,
        pricingModel: preset.pricingModel,
        percentRate: preset.percentRate ?? null,
        monthsCount: preset.monthsCount ?? null,
        fixedAmount: preset.fixedAmount ?? null,
        subscriptionAmount: preset.subscriptionAmount ?? null,
        subscriptionSlots: preset.subscriptionSlots ?? null,
        hourlyRate: preset.hourlyRate ?? null,
        guaranteeDays: preset.guaranteeDays,
        prepaymentPercent: preset.prepaymentPercent,
        paymentTerms: preset.paymentTerms,
        startsAt: now,
        status: "PENDING",
        acceptedByUserId: params.acceptedByUserId,
        acceptedAt: now,
      },
      select: { id: true },
    });
  });
}

/**
 * Агентство подтверждает условия: договор становится действующим,
 * а клиент из лида — активным.
 *
 * Одной транзакцией: клиент со статусом LEAD и действующим договором —
 * несогласованное состояние, из которого потом трудно понять, что случилось.
 */
export async function confirmAgreement(actor: Actor, agreementId: string) {
  const agreement = await prisma.agreement.findFirst({
    where: {
      id: agreementId,
      organizationId: actor.organizationId,
      status: "PENDING",
    },
    select: { id: true, clientId: true },
  });

  if (!agreement) throw new AgreementError("Договор не найден или уже подтверждён");

  await prisma.$transaction([
    prisma.agreement.update({
      where: { id: agreement.id },
      data: { status: "ACTIVE" },
    }),
    prisma.client.update({
      where: { id: agreement.clientId },
      data: { status: "ACTIVE" },
    }),
  ]);

  return { clientId: agreement.clientId };
}

/** Расторжение действующих условий. Клиент уходит на паузу. */
export async function terminateAgreement(actor: Actor, agreementId: string) {
  const agreement = await prisma.agreement.findFirst({
    where: {
      id: agreementId,
      organizationId: actor.organizationId,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: { id: true, clientId: true },
  });

  if (!agreement) throw new AgreementError("Договор не найден");

  await prisma.$transaction([
    prisma.agreement.update({
      where: { id: agreement.id },
      data: { status: "TERMINATED", endsAt: new Date() },
    }),
    prisma.client.update({
      where: { id: agreement.clientId },
      data: { status: "PAUSED" },
    }),
  ]);

  return { clientId: agreement.clientId };
}

/**
 * Prisma отдаёт Decimal — в расчёты нужны обычные числа.
 * Точности double хватает: суммы вознаграждения далеко от границ.
 */
export function toPricingParams(agreement: {
  pricingModel: PricingParams["pricingModel"];
  percentRate: unknown;
  monthsCount: number | null;
  fixedAmount: unknown;
  subscriptionAmount: unknown;
  subscriptionSlots: number | null;
  hourlyRate: unknown;
}): PricingParams {
  return {
    pricingModel: agreement.pricingModel,
    percentRate: decimalToNumber(agreement.percentRate),
    monthsCount: agreement.monthsCount,
    fixedAmount: decimalToNumber(agreement.fixedAmount),
    subscriptionAmount: decimalToNumber(agreement.subscriptionAmount),
    subscriptionSlots: agreement.subscriptionSlots,
    hourlyRate: decimalToNumber(agreement.hourlyRate),
  };
}

/**
 * Prisma Decimal — объект, а не число. Он не переживает границу
 * «серверный компонент → клиентский»: React отказывается его
 * сериализовать. В dev это предупреждение в логах, в проде — падение
 * страницы, поэтому деньги приводятся к number на выходе из сервиса,
 * а не там, где рисуются.
 */
export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}
