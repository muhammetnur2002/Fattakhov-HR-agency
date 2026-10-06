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
  options: {
    /**
     * Компания, зарегистрировавшаяся сама. Заявка связывается с ней,
     * чтобы после анкеты дописать название и вакансию (completeLeadFromBrief).
     */
    clientId?: string;
    /**
     * Оповещать ли агентство сейчас. Регистрация заводит заявку в момент
     * согласия — тогда же нужны его момент, адрес и браузер, — но
     * оповещать ей пока нечем: ни компании, ни вакансии. Оповещение
     * уходит после анкеты, с тем, что уже можно разбирать.
     */
    notify?: boolean;
    /**
     * Версия показанного текста, если это не галочка формы заявки сайта:
     * регистрация показывает свой текст (lib/legal/registration-consent.ts),
     * и доказывать нужно именно его.
     */
    consentVersion?: string;
    /**
     * Когда поставили галочку, если раньше, чем заводится заявка:
     * регистрация по почте спрашивает согласие на первом экране,
     * а компания появляется только после кода из письма.
     */
    consentAt?: Date;
  } = {},
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
      consentVersion: options.consentVersion ?? CONSENT_VERSION,
      consentAt: options.consentAt ?? new Date(),
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? new Date() : null,

      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      clientId: options.clientId ?? null,
    },
    select: { id: true },
  });

  if (options.notify !== false) {
    await notifyLeadReceived(organization.id, input);
  }

  return lead;
}

async function notifyLeadReceived(
  organizationId: string,
  lead: { name: string; company?: string | null; vacancies?: string | null; contact: string },
): Promise<void> {
  await notify({
    organizationId,
    userIds: await intakeRecipients(organizationId),
    event: "LEAD_RECEIVED",
    title: `Заявка с сайта: ${lead.name}${lead.company ? `, ${lead.company}` : ""}`,
    body: [lead.vacancies, lead.contact].filter(Boolean).join(". "),
    linkUrl: "/a/leads",
  });
}

/**
 * Дописать заявку самостоятельной регистрации после анкеты и оповестить
 * агентство — теперь есть что разбирать: компания, контакт, вакансия.
 *
 * Согласие не трогаем: его момент, версия, адрес и браузер — от запроса
 * регистрации, когда галочку и поставили.
 */
export async function completeLeadFromBrief(
  clientId: string,
  data: { name: string; company: string; contact: string; note: string },
): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const organization = await prisma.organization.findFirst({ select: { id: true } });
  if (!organization) return;

  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        name: data.name,
        company: data.company,
        contact: data.contact,
        note: data.note,
      },
    });
  }

  await notifyLeadReceived(organization.id, {
    name: data.name,
    company: data.company,
    vacancies: data.note,
    contact: data.contact,
  });
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
 * Поиск и фильтр по статусу — очередь копится бессрочно, и через
 * пару месяцев в ней нечем найти конкретную заявку без них.
 */
export async function listLeads(
  filters: { query?: string; status?: LeadView["status"] } = {},
): Promise<LeadView[]> {
  return prisma.lead.findMany({
    where: {
      ...(filters.status && { status: filters.status }),
      ...(filters.query && {
        OR: [
          { name: { contains: filters.query, mode: "insensitive" } },
          { company: { contains: filters.query, mode: "insensitive" } },
          { contact: { contains: filters.query, mode: "insensitive" } },
        ],
      }),
    },
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
