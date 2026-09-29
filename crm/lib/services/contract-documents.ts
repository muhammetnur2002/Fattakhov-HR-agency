import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/notify";
import { AgreementError } from "@/lib/services/agreements";
import { buildStorageKey, validateUpload } from "@/lib/storage";
import { getStorage } from "@/lib/storage/client";
import { buildSignedUrl } from "@/lib/storage/signing";

/**
 * Договор для клиентов без договора: шаблон, который агентство выкладывает
 * один раз, и подписанный скан или фото, которое клиент присылает на проверку.
 *
 * Отдельных таблиц нет — обе вещи лежат в общем хранилище вложений (BR-37,
 * подписанная ссылка) с видом CONTRACT:
 *   шаблон       — без клиента и без договора (общий для организации);
 *   скан клиента — с clientId, а если у клиента уже есть договор на подтверждении,
 *                  то и с agreementId: тогда агентство видит его прямо в карточке
 *                  договора, рядом с кнопкой «Подтвердить».
 */

export type ContractFile = { id: string; fileName: string; createdAt: Date; url: string };

async function store(
  actor: Actor,
  file: File,
  scope: { scopeId: string; clientId: string | null; agreementId: string | null },
): Promise<void> {
  const body = Buffer.from(await file.arrayBuffer());
  validateUpload({ size: file.size, type: file.type, body });

  const storageKey = buildStorageKey({
    organizationId: actor.organizationId,
    scope: "contracts",
    scopeId: scope.scopeId,
    fileName: file.name,
  });
  await getStorage().put({ key: storageKey, body, mimeType: file.type });

  await prisma.attachment.create({
    data: {
      organizationId: actor.organizationId,
      kind: "CONTRACT",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      storageKey,
      visibility: "SHARED",
      clientId: scope.clientId,
      agreementId: scope.agreementId,
      uploadedById: actor.id,
    },
  });
}

/** Актуальный шаблон договора: последний общий файл организации. */
export async function getContractTemplate(organizationId: string): Promise<ContractFile | null> {
  const row = await prisma.attachment.findFirst({
    where: { organizationId, kind: "CONTRACT", clientId: null, agreementId: null, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true, storageKey: true },
  });
  return row
    ? { id: row.id, fileName: row.fileName, createdAt: row.createdAt, url: buildSignedUrl(row.storageKey) }
    : null;
}

/** Агентство выкладывает новый шаблон; прежние остаются в истории. */
export async function uploadContractTemplate(actor: Actor, file: File): Promise<void> {
  await store(actor, file, { scopeId: "template", clientId: null, agreementId: null });
}

/**
 * Убрать шаблон совсем: клиенты снова увидят подсказку «шаблон готовит менеджер».
 * Файлы не стираются с диска сразу — это мягкое удаление, как у остальных вложений (BR-26).
 */
export async function deleteContractTemplate(actor: Actor): Promise<number> {
  const result = await prisma.attachment.updateMany({
    where: { organizationId: actor.organizationId, kind: "CONTRACT", clientId: null, agreementId: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

/**
 * Клиент присылает подписанный договор. Если у него уже есть договор на
 * подтверждении, скан привязывается к нему, иначе остаётся у клиента.
 * Агентству уходит уведомление — проверить и подтвердить.
 */
export async function submitSignedContract(actor: Actor, file: File): Promise<void> {
  if (!actor.clientId) throw new AgreementError("Кабинет не привязан к компании");

  const [client, pending] = await Promise.all([
    prisma.client.findFirst({
      where: { id: actor.clientId },
      select: { id: true, name: true, accountManagerId: true },
    }),
    prisma.agreement.findFirst({
      where: { clientId: actor.clientId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  if (!client) throw new AgreementError("Клиент не найден");

  await store(actor, file, { scopeId: client.id, clientId: client.id, agreementId: pending?.id ?? null });

  // Кому проверять: ответственному по клиенту, а без него — руководству
  const staff = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      isActive: true,
      deletedAt: null,
      OR: [{ id: client.accountManagerId ?? "" }, { role: { in: ["OWNER", "HEAD"] } }],
    },
    select: { id: true },
  });
  await notify({
    organizationId: actor.organizationId,
    userIds: staff.map((u) => u.id),
    event: "CONTRACT_UPLOADED",
    title: `Подписанный договор от клиента: ${client.name}`,
    body: "Проверьте файл и подтвердите договор в карточке клиента.",
    linkUrl: `/a/clients/${client.id}`,
  });
}

/** Что клиент уже присылал: свежие сверху. Файлы агентства сюда не входят. */
export async function listSubmittedContracts(clientId: string): Promise<ContractFile[]> {
  const clientUsers = await prisma.user.findMany({ where: { clientId }, select: { id: true } });
  const rows = await prisma.attachment.findMany({
    where: {
      kind: "CONTRACT",
      clientId,
      deletedAt: null,
      uploadedById: { in: clientUsers.map((u) => u.id) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, fileName: true, createdAt: true, storageKey: true },
  });
  return rows.map((r) => ({ id: r.id, fileName: r.fileName, createdAt: r.createdAt, url: buildSignedUrl(r.storageKey) }));
}

/** Присланное клиентом, что ещё не привязано к договору, — чтобы агентство не пропустило файл. */
export async function listUnattachedClientContracts(clientId: string): Promise<ContractFile[]> {
  const clientUsers = await prisma.user.findMany({ where: { clientId }, select: { id: true } });
  const rows = await prisma.attachment.findMany({
    where: {
      kind: "CONTRACT",
      clientId,
      agreementId: null,
      deletedAt: null,
      uploadedById: { in: clientUsers.map((u) => u.id) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true, storageKey: true },
  });
  return rows.map((r) => ({ id: r.id, fileName: r.fileName, createdAt: r.createdAt, url: buildSignedUrl(r.storageKey) }));
}
