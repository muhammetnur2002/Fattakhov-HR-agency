import { randomBytes } from "node:crypto";

import type { Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import type { ConsentStatus } from "@/lib/generated/prisma/enums";
import { CANDIDATE_CONSENT_VERSION } from "@/lib/legal/candidate-consent";

export class ConsentError extends Error {}

/**
 * Согласие на обработку персональных данных (BR-33).
 *
 * Срок действия — год с момента получения (BR-34). Дальше данные
 * подлежат удалению или обезличиванию, если согласие не продлено.
 */
const CONSENT_TTL_MONTHS = 12;

/** Сколько живёт ссылка на форму согласия. */
const LINK_TTL_DAYS = 14;

/**
 * Действует ли согласие прямо сейчас.
 *
 * Статуса для этого мало. GIVEN превращается в EXPIRED фоновой задачей
 * (expireConsents), и между наступлением срока и её ближайшим проходом
 * кандидат остаётся GIVEN с истёкшим согласием. Если обработчик
 * не запущен вовсе — остаётся им сколько угодно долго.
 *
 * Для счёта такой зазор — задержка цифры на плитке. Здесь — передача
 * персональных данных работодателю без действующего согласия, о которой
 * никто не узнает: проверка пройдена, кандидат представлен.
 *
 * Пустой срок считаем недействующим намеренно. Все согласия, выданные
 * через giveConsent, срок имеют; запись без него — это данные,
 * про которые мы не можем сказать, действуют они или нет, и толковать
 * такое в свою пользу в вопросе о персональных данных не стоит.
 */
export function consentIsValid(
  status: ConsentStatus,
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (status !== "GIVEN") return false;
  if (!expiresAt) return false;
  return expiresAt > now;
}

/**
 * То же правило фрагментом запроса — чтобы найти все просроченные разом.
 *
 * Живёт рядом с предикатом и по той же причине, что isOverdue рядом
 * с overdueInvoiceFilter: одно правило, записанное в двух местах,
 * однажды разъедется, и заметить это будет нечем.
 *
 * Пустой срок сюда тоже попадает: предикат считает такую запись
 * недействующей, и задача должна привести статус в соответствие —
 * иначе в интерфейсе висит GIVEN, а представить кандидата нельзя,
 * и понять почему неоткуда.
 */
export function expiredConsentFilter(now: Date = new Date()) {
  return {
    consentStatus: "GIVEN" as const,
    OR: [{ consentExpiresAt: { lt: now } }, { consentExpiresAt: null }],
  };
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Ссылка на форму согласия для кандидата. */
export async function createConsentLink(
  actor: Actor,
  candidateId: string,
): Promise<string> {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true, consentStatus: true, consentExpiresAt: true },
  });
  if (!candidate) throw new ConsentError("Кандидат не найден");
  // Голого статуса недостаточно: фоновая задача (expireConsents)
  // проставляет EXPIRED не мгновенно, и до её прохода статус ещё
  // GIVEN, хотя срок уже вышел — отказывать в новой ссылке в этом
  // окне значит держать кандидата без действующего согласия и без
  // способа его обновить
  if (consentIsValid(candidate.consentStatus, candidate.consentExpiresAt)) {
    throw new ConsentError("Согласие уже получено");
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + LINK_TTL_DAYS);

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { consentToken: token, consentTokenExpiresAt: expiresAt },
  });

  return token;
}

/** Данные для публичной формы. null на любой негодный токен. */
export async function getConsentRequest(token: string) {
  return prisma.candidate.findFirst({
    where: {
      consentToken: token,
      consentTokenExpiresAt: { gt: new Date() },
      consentStatus: { in: ["PENDING", "EXPIRED"] },
    },
    select: {
      id: true,
      fullName: true,
      organization: { select: { name: true } },
    },
  });
}

/**
 * Кандидат дал согласие.
 *
 * Фиксируем время, адрес и версию текста: без этого согласие
 * невозможно подтвердить, а значит его как бы и нет.
 */
export async function giveConsent(params: {
  token: string;
  ip?: string;
}): Promise<{ candidateId: string }> {
  const candidate = await prisma.candidate.findFirst({
    where: {
      consentToken: params.token,
      consentTokenExpiresAt: { gt: new Date() },
    },
    select: { id: true, organizationId: true },
  });
  if (!candidate) throw new ConsentError("Ссылка недействительна или истекла");

  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + CONSENT_TTL_MONTHS);

  await prisma.$transaction([
    prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        consentStatus: "GIVEN",
        consentGivenAt: now,
        consentExpiresAt: expires,
        consentVersion: CANDIDATE_CONSENT_VERSION,
        // Ссылку гасим: повторно подтверждать нечего
        consentToken: null,
        consentTokenExpiresAt: null,
      },
    }),
    // Факт получения согласия — тоже событие с ПДн (BR-36)
    prisma.personalDataAccessLog.create({
      data: {
        organizationId: candidate.organizationId,
        actorId: candidate.id,
        candidateId: candidate.id,
        action: "consent_given",
        ip: params.ip,
      },
    }),
  ]);

  return { candidateId: candidate.id };
}

/** Отзыв согласия. Данные после этого подлежат удалению. */
export async function revokeConsent(
  actor: Actor,
  candidateId: string,
): Promise<void> {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!candidate) throw new ConsentError("Кандидат не найден");

  await prisma.$transaction([
    prisma.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "REVOKED", consentToken: null },
    }),
    prisma.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId,
        action: "consent_revoked",
      },
    }),
  ]);
}
