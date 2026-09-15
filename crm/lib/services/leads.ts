import { CONSENT_VERSION } from "@/lib/legal/consent-texts";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/notify";
import { intakeRecipients } from "@/lib/notifications/recipients";
import type { LeadInput } from "@/lib/validation/lead";

export class LeadError extends Error {}

/**
 * Заявка с лендинга.
 *
 * Единственная точка в системе, куда пишет человек без аккаунта и без
 * токена. Поэтому здесь нет и не должно быть ничего, кроме записи
 * заявки и оповещения: никаких клиентов, договоров и вакансий по
 * присланным данным не создаётся.
 *
 * Оповещение идёт тем же ролям, что разбирают входящие заявки на
 * подбор: владелец, руководитель, аккаунт-менеджер.
 */
/**
 * Вход сервиса: всё из формы, кроме самой галочки.
 *
 * Галочку проверяет схема на границе, и до сервиса заявка без неё
 * не доходит. Тащить сюда литерал "on" значит требовать от каждого
 * вызывающего знать, как браузер кодирует чекбокс.
 */
export type LeadCreateInput = Omit<LeadInput, "consent">;

export async function createLead(
  input: LeadCreateInput,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ id: string }> {
  const organization = await prisma.organization.findFirst({
    select: { id: true },
  });
  if (!organization) {
    // Заявка приходит снаружи, и терять её из-за нашей неготовности нельзя
    throw new LeadError("Организация не настроена, обратитесь напрямую");
  }

  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      company: input.company,
      website: input.website,
      contact: input.contact,
      vacancies: input.vacancies,
      note: input.note,

      // Доказательство согласия: версия текста и момент. Сам факт
      // галочки уже проверен схемой, до сюда заявка без него
      // не доходит
      consentVersion: CONSENT_VERSION,
      consentAt: new Date(),
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? new Date() : null,

      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
    },
    select: { id: true },
  });

  await notify({
    organizationId: organization.id,
    userIds: await intakeRecipients(organization.id),
    event: "LEAD_RECEIVED",
    title: `Заявка с сайта: ${input.name}${input.company ? `, ${input.company}` : ""}`,
    body: [input.vacancies, input.contact].filter(Boolean).join(". "),
    linkUrl: "/a/leads",
  });

  return lead;
}

export type LeadView = {
  id: string;
  name: string;
  company: string | null;
  website: string | null;
  contact: string;
  vacancies: string | null;
  note: string | null;
  status: "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED" | "SPAM";
  createdAt: Date;
  processedAt: Date | null;
};

/**
 * Заявки для кабинета агентства.
 *
 * Свежие сверху: заявка ценна первые часы, а не как архивная запись.
 */
export async function listLeads(): Promise<LeadView[]> {
  return prisma.lead.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      company: true,
      website: true,
      contact: true,
      vacancies: true,
      note: true,
      status: true,
      createdAt: true,
      processedAt: true,
    },
  });
}

export async function countNewLeads(): Promise<number> {
  return prisma.lead.count({ where: { status: "NEW" } });
}

/** Одна заявка — для предзаполнения формы нового клиента при конвертации. */
export async function getLead(id: string): Promise<LeadView | null> {
  return prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      website: true,
      contact: true,
      vacancies: true,
      note: true,
      status: true,
      createdAt: true,
      processedAt: true,
    },
  });
}

/** Отметка о разборе заявки. Кто разобрал, пишем строкой: см. модель. */
export async function setLeadStatus(params: {
  leadId: string;
  status: LeadView["status"];
  actorName: string;
}): Promise<void> {
  await prisma.lead.update({
    where: { id: params.leadId },
    data: {
      status: params.status,
      processedAt: params.status === "NEW" ? null : new Date(),
      processedBy: params.status === "NEW" ? null : params.actorName,
    },
  });
}
