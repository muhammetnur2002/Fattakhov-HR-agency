import { randomBytes } from "node:crypto";

import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type {
  ConsentStatus,
  DisclosureContactMode,
} from "@/lib/generated/prisma/enums";
import {
  DISCLOSURE_CONSENT_TTL_DAYS,
  DISCLOSURE_CONSENT_VERSION,
} from "@/lib/legal/disclosure-consent";

export class DisclosureError extends Error {}

/** Сколько живёт ссылка на форму. Столько же, сколько у общего согласия. */
const LINK_TTL_DAYS = 14;

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Действует ли подтверждение прямо сейчас.
 *
 * Правило то же, что у consentIsValid: статуса мало, нужен срок.
 * Пустой срок считаем недействующим — запись, про которую нельзя
 * сказать, действует она или нет, в вопросе о персональных данных
 * толкуется не в нашу пользу.
 */
export function disclosureIsValid(
  status: ConsentStatus,
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (status !== "GIVEN") return false;
  if (!expiresAt) return false;
  return expiresAt > now;
}

/** То же правило фрагментом запроса — чтобы фоновая задача нашла просроченные. */
export function expiredDisclosureFilter(now: Date = new Date()) {
  return {
    status: "GIVEN" as const,
    OR: [{ expiresAt: { lt: now } }, { expiresAt: null }],
  };
}

/**
 * Действующее подтверждение по этой паре «кандидат + вакансия».
 *
 * Именно пара, а не кандидат: §8.1 документа запрещает распространять
 * подтверждение на другого работодателя или другую вакансию.
 */
export async function findValidDisclosure(
  candidateId: string,
  vacancyId: string,
  now: Date = new Date(),
) {
  return prisma.disclosureConsent.findFirst({
    where: {
      candidateId,
      vacancyId,
      status: "GIVEN",
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      contactMode: true,
      givenAt: true,
      expiresAt: true,
      confirmedById: true,
    },
  });
}

/** Что показать рекрутеру в карточке: есть подтверждение или нет. */
export async function getDisclosureState(
  candidateId: string,
  vacancyId: string,
) {
  const valid = await findValidDisclosure(candidateId, vacancyId);
  if (valid) return { confirmed: true as const, ...valid };

  const pending = await prisma.disclosureConsent.findFirst({
    where: {
      candidateId,
      vacancyId,
      status: "PENDING",
      tokenExpiresAt: { gt: new Date() },
    },
    select: { id: true, tokenExpiresAt: true },
    orderBy: { createdAt: "desc" },
  });

  return { confirmed: false as const, awaiting: pending };
}

/**
 * Ссылка кандидату на форму подтверждения.
 *
 * Реквизиты работодателя и название вакансии снимаются здесь и хранятся
 * в записи: кандидат должен подтверждать то, что видел, а справочник
 * к моменту разбора обращения может выглядеть иначе.
 */
export async function createDisclosureLink(
  actor: Actor,
  applicationId: string,
): Promise<string> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      candidateId: true,
      vacancyId: true,
      vacancy: {
        select: {
          title: true,
          number: true,
          client: { select: { id: true, name: true, legalName: true, inn: true } },
        },
      },
    },
  });
  if (!application) throw new DisclosureError("Кандидат не найден");

  const client = application.vacancy.client;
  if (!client) throw new DisclosureError("У вакансии нет клиента");

  if (await findValidDisclosure(application.candidateId, application.vacancyId)) {
    throw new DisclosureError("Подтверждение уже получено");
  }

  const token = generateToken();
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + LINK_TTL_DAYS);

  await prisma.disclosureConsent.create({
    data: {
      organizationId: actor.organizationId,
      candidateId: application.candidateId,
      vacancyId: application.vacancyId,
      clientId: client.id,
      // Юрлицо, а не коммерческое имя: в документе §1 требуется полное
      // наименование. legalName заполнен не у всех клиентов, тогда берём
      // то, под которым он заведён
      employerName: client.legalName?.trim() || client.name,
      employerInn: client.inn,
      vacancyTitle: `№${application.vacancy.number} ${application.vacancy.title}`,
      token,
      tokenExpiresAt,
      createdById: actor.id,
    },
  });

  return token;
}

/** Данные для публичной формы. null на любой негодный токен. */
export async function getDisclosureRequest(token: string) {
  return prisma.disclosureConsent.findFirst({
    where: {
      token,
      tokenExpiresAt: { gt: new Date() },
      status: "PENDING",
    },
    select: {
      id: true,
      employerName: true,
      employerInn: true,
      vacancyTitle: true,
      candidate: { select: { fullName: true } },
      organization: { select: { name: true } },
    },
  });
}

/**
 * Кандидат подтвердил передачу.
 *
 * Срок считаем от момента подтверждения, хотя §6.1 отсчитывает 90 дней
 * от даты предоставления данных работодателю. Предоставление всегда
 * позже подтверждения, значит наш срок истекает не позже документного —
 * мы строже, а не мягче. Считать от предоставления значило бы оставить
 * запись без срока в промежутке между подтверждением и представлением.
 */
export async function giveDisclosure(params: {
  token: string;
  contactMode: DisclosureContactMode;
  ip?: string;
  userAgent?: string;
}): Promise<{ candidateId: string }> {
  const record = await prisma.disclosureConsent.findFirst({
    where: {
      token: params.token,
      tokenExpiresAt: { gt: new Date() },
      status: "PENDING",
    },
    select: { id: true, organizationId: true, candidateId: true },
  });
  if (!record) throw new DisclosureError("Ссылка недействительна или истекла");

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + DISCLOSURE_CONSENT_TTL_DAYS);

  await prisma.$transaction([
    prisma.disclosureConsent.update({
      where: { id: record.id },
      data: {
        status: "GIVEN",
        contactMode: params.contactMode,
        version: DISCLOSURE_CONSENT_VERSION,
        givenAt: now,
        expiresAt,
        ip: params.ip,
        userAgent: params.userAgent,
        // Ссылку гасим: подтверждать повторно нечего
        token: null,
        tokenExpiresAt: null,
      },
    }),
    prisma.personalDataAccessLog.create({
      data: {
        organizationId: record.organizationId,
        actorId: record.candidateId,
        candidateId: record.candidateId,
        action: "disclosure_consent_given",
        ip: params.ip,
      },
    }),
  ]);

  return { candidateId: record.candidateId };
}

/**
 * Запасной путь: подтверждение получено вне системы (письмом, на бумаге).
 *
 * Отдельная функция, а не флаг у giveDisclosure, намеренно: здесь нет
 * ни IP, ни браузера, ни версии, под которой кандидат поставил галочку
 * сам, — то есть нет того следа, который §8.3 документа считает
 * подтверждением волеизъявления. Кто отметил, видно в confirmedById,
 * и спрос в разборе будет с него.
 */
export async function markDisclosureManually(
  actor: Actor,
  applicationId: string,
  contactMode: DisclosureContactMode,
): Promise<void> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      candidateId: true,
      vacancyId: true,
      vacancy: {
        select: {
          title: true,
          number: true,
          client: { select: { id: true, name: true, legalName: true, inn: true } },
        },
      },
    },
  });
  if (!application) throw new DisclosureError("Кандидат не найден");

  const client = application.vacancy.client;
  if (!client) throw new DisclosureError("У вакансии нет клиента");

  if (await findValidDisclosure(application.candidateId, application.vacancyId)) {
    throw new DisclosureError("Подтверждение уже получено");
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + DISCLOSURE_CONSENT_TTL_DAYS);

  await prisma.$transaction([
    prisma.disclosureConsent.create({
      data: {
        organizationId: actor.organizationId,
        candidateId: application.candidateId,
        vacancyId: application.vacancyId,
        clientId: client.id,
        employerName: client.legalName?.trim() || client.name,
        employerInn: client.inn,
        vacancyTitle: `№${application.vacancy.number} ${application.vacancy.title}`,
        status: "GIVEN",
        contactMode,
        version: DISCLOSURE_CONSENT_VERSION,
        givenAt: now,
        expiresAt,
        createdById: actor.id,
        confirmedById: actor.id,
      },
    }),
    prisma.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId: application.candidateId,
        action: "disclosure_consent_marked_manually",
      },
    }),
  ]);
}
