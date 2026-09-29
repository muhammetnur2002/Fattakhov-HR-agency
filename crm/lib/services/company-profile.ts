import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { buildStorageKey, validateUpload } from "@/lib/storage";
import { getStorage } from "@/lib/storage/client";
import { clientSchema } from "@/lib/validation/client";
import { z } from "zod";

/**
 * Профиль компании клиента: название, реквизиты, «о компании», логотип.
 *
 * Клиент ведёт его сам (администратор компании). Для клиентов, которые пришли без
 * договора, ИНН и описание — то, по чему агентство проверяет компанию перед
 * публикацией вакансии на студенческой платформе.
 */

export class CompanyProfileError extends Error {}

/** Поля, которые клиент правит сам. Ответственного менеджера и статус он менять не может. */
export const companyProfileSchema = clientSchema.pick({
  name: true,
  legalName: true,
  inn: true,
  industry: true,
  city: true,
  website: true,
  description: true,
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export type CompanyProfile = {
  id: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  industry: string | null;
  city: string | null;
  website: string | null;
  description: string | null;
  logoUrl: string | null;
};

export async function getCompanyProfile(clientId: string): Promise<CompanyProfile | null> {
  return prisma.client.findFirst({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      legalName: true,
      inn: true,
      industry: true,
      city: true,
      website: true,
      description: true,
      logoUrl: true,
    },
  });
}

/** Сохранить профиль. Пустое поле очищает значение — в отличие от карточки клиента у агентства. */
export async function updateCompanyProfile(clientId: string, input: CompanyProfileInput): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      name: input.name,
      legalName: input.legalName ?? null,
      inn: input.inn ?? null,
      industry: input.industry ?? null,
      city: input.city ?? null,
      website: input.website ?? null,
      description: input.description ?? null,
    },
  });
}

const LOGO_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * Логотип лежит в общем хранилище вложений (BR-37), а в карточке клиента хранится
 * адрес его раздачи через CRM: так он одинаково открывается и клиенту, и агентству,
 * а в аватарках переписки менять ничего не нужно.
 */
export async function saveCompanyLogo(actor: Actor, clientId: string, file: File): Promise<string> {
  if (!LOGO_TYPES.has(file.type)) throw new CompanyProfileError("Логотип — картинка JPG или PNG");
  const body = Buffer.from(await file.arrayBuffer());
  validateUpload({ size: file.size, type: file.type, body });

  const storageKey = buildStorageKey({
    organizationId: actor.organizationId,
    scope: "company-logo",
    scopeId: clientId,
    fileName: file.name,
  });
  await getStorage().put({ key: storageKey, body, mimeType: file.type });
  await prisma.attachment.create({
    data: {
      organizationId: actor.organizationId,
      kind: "OTHER",
      fileName: `logo:${file.name}`,
      fileSize: file.size,
      mimeType: file.type,
      storageKey,
      visibility: "SHARED",
      clientId,
      uploadedById: actor.id,
    },
  });

  const url = `/api/company-logo/${clientId}?v=${Date.now()}`;
  await prisma.client.update({ where: { id: clientId }, data: { logoUrl: url } });
  return url;
}

/** Актуальный логотип: последний загруженный. */
export async function readCompanyLogo(clientId: string): Promise<{ body: Buffer; mimeType: string } | null> {
  const row = await prisma.attachment.findFirst({
    where: { clientId, kind: "OTHER", fileName: { startsWith: "logo:" }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { storageKey: true, mimeType: true },
  });
  if (!row) return null;
  return { body: await getStorage().get(row.storageKey), mimeType: row.mimeType };
}

/** Убрать логотип: файл остаётся в истории, но в профиле его больше нет. */
export async function removeCompanyLogo(clientId: string): Promise<void> {
  await prisma.attachment.updateMany({
    where: { clientId, kind: "OTHER", fileName: { startsWith: "logo:" }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  await prisma.client.update({ where: { id: clientId }, data: { logoUrl: null } });
}
