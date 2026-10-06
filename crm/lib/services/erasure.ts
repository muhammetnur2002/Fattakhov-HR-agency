import type { Actor } from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type {
  ErasureReason,
  ErasureState,
} from "@/lib/generated/prisma/enums";

export class ErasureError extends Error {}

/**
 * Контур уничтожения персональных данных (ст. 21 152-ФЗ).
 *
 * Три состояния, и каждое отвечает своей обязанности оператора:
 *
 *   BLOCKED_FOR_ERASURE — обработка прекращена. Закон даёт на это
 *     10 рабочих дней с требования, но тянуть незачем: блокируем сразу,
 *     как только возникло основание. С этого момента кандидата нельзя
 *     ни двигать по воронке, ни вносить ему оффер, ни представить клиенту.
 *   ERASURE_PENDING — решение принято, стоит в очереди на исполнение.
 *     Отличается от предыдущего тем, что уничтожение уже неотвратимо:
 *     ближайший проход задачи его исполнит.
 *   ANONYMIZED — исполнено.
 *
 * Сроки из закона: уничтожить в течение 30 дней с даты основания;
 * при технической невозможности допускается до 6 месяцев, но данные
 * всё это время обязаны быть заблокированы. Мы берём 30 дней как
 * крайний срок и блокируем сразу — второй случай нам не нужен.
 *
 * Зачем состояния вообще, если есть ConsentStatus. Согласие отвечает
 * на вопрос «можно ли обрабатывать». Оно молчит о том, что оператор
 * обязан сделать дальше и к какому сроку. До этого модуля отозванное
 * согласие означало строку в списке «требуют решения», и данные лежали
 * до тех пор, пока человек не нажмёт кнопку. Если не нажмёт — лежат
 * вечно, а срок по закону идёт.
 */

/** Крайний срок уничтожения с даты основания (ч. 5.1 ст. 21). */
export const ERASURE_DEADLINE_DAYS = 30;

const DAY = 86_400_000;

/** Состояния, в которых работать с данными кандидата нельзя. */
const BLOCKING: ReadonlySet<ErasureState> = new Set([
  "BLOCKED_FOR_ERASURE",
  "ERASURE_PENDING",
  "ANONYMIZED",
]);

/**
 * Можно ли работать с кандидатом.
 *
 * Отдельная функция, а не сравнение с ACTIVE по месту: правило
 * проверяется в нескольких местах (движение по воронке, оффер,
 * представление клиенту), и разъехаться им нельзя.
 */
export function erasureBlocksProcessing(state: ErasureState): boolean {
  return BLOCKING.has(state);
}

/** Человеческое объяснение, почему кандидат недоступен. */
export function erasureBlockMessage(state: ErasureState): string {
  if (state === "ANONYMIZED") {
    return "Данные кандидата уничтожены по требованию о прекращении обработки";
  }
  return "Обработка данных кандидата прекращена: идёт уничтожение по 152-ФЗ";
}

/**
 * Возникло основание для уничтожения — блокируем обработку и назначаем срок.
 *
 * Идемпотентна: повторный вызов по уже заблокированному кандидату
 * ничего не меняет и срок не продлевает. Иначе повторный отзыв согласия
 * отодвигал бы крайний срок, то есть нарушение выглядело бы как норма.
 */
export async function blockForErasure(params: {
  candidateId: string;
  organizationId: string;
  reason: ErasureReason;
  /** Кто инициировал: сотрудник или сама система (тогда сам кандидат). */
  actorId: string;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();

  const candidate = await prismaRaw.candidate.findFirst({
    where: { id: params.candidateId, organizationId: params.organizationId },
    select: { id: true, erasureState: true },
  });
  if (!candidate) throw new ErasureError("Кандидат не найден");
  if (candidate.erasureState !== "ACTIVE") return false;

  await prismaRaw.$transaction([
    prismaRaw.candidate.update({
      where: { id: params.candidateId },
      data: {
        erasureState: "BLOCKED_FOR_ERASURE",
        erasureReason: params.reason,
        erasureRequestedAt: now,
        erasureDueAt: new Date(now.getTime() + ERASURE_DEADLINE_DAYS * DAY),
      },
    }),
    prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        candidateId: params.candidateId,
        action: "erasure_blocked",
      },
    }),
  ]);

  return true;
}

/**
 * Согласие получено — снять блокировку, если её причиной было истечение:
 * срока согласия (CONSENT_EXPIRED) или срока сорсинг-лида, который так
 * и не дал согласия за 14 дней (SOURCING_EXPIRED, lib/services/sourcing.ts).
 *
 * Основание отпало: человек снова (или впервые) разрешил обработку. Отзыв и прямое
 * требование об уничтожении так не отменяются — там кандидат просил
 * удалить данные, и новая галочка этой просьбы не перекрывает; такие
 * случаи разбирает человек. Уже поставленное в очередь (ERASURE_PENDING)
 * тоже не трогаем: это принятое решение, а не автоматическая блокировка.
 *
 * Одна функция на оба пути продления — ссылку кандидата (giveConsent)
 * и ручную отметку рекрутера (markConsentGiven). Иначе продление вручную
 * оставило бы кандидата заблокированным с действующим согласием, а через
 * тридцать дней очередь уничтожила бы его данные.
 */
export async function liftExpiredConsentBlock(candidateId: string): Promise<void> {
  await prismaRaw.candidate.updateMany({
    where: {
      id: candidateId,
      erasureState: "BLOCKED_FOR_ERASURE",
      erasureReason: { in: ["CONSENT_EXPIRED", "SOURCING_EXPIRED"] },
    },
    data: {
      erasureState: "ACTIVE",
      erasureReason: null,
      erasureRequestedAt: null,
      erasureDueAt: null,
    },
  });
}

/**
 * Поставить в очередь на уничтожение.
 *
 * Отдельным шагом от блокировки: блокировка наступает автоматически
 * по основанию, а очередь — это решение, что препятствий нет. Нажимает
 * человек; если не нажмёт, задача исполнит уничтожение по сроку сама.
 */
export async function queueErasure(
  actor: Actor,
  candidateId: string,
): Promise<void> {
  const candidate = await prismaRaw.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true, erasureState: true },
  });
  if (!candidate) throw new ErasureError("Кандидат не найден");
  if (candidate.erasureState === "ANONYMIZED") {
    throw new ErasureError("Данные уже уничтожены");
  }
  if (candidate.erasureState === "ACTIVE") {
    throw new ErasureError(
      "Нет основания для уничтожения: согласие действует и требования не поступало",
    );
  }

  await prismaRaw.$transaction([
    prismaRaw.candidate.update({
      where: { id: candidateId },
      data: { erasureState: "ERASURE_PENDING" },
    }),
    prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId,
        action: "erasure_queued",
      },
    }),
  ]);
}

export type ErasureQueueItem = {
  id: string;
  fullName: string;
  state: ErasureState;
  reason: ErasureReason | null;
  requestedAt: Date | null;
  dueAt: Date | null;
  /** Сколько дней осталось до крайнего срока. Отрицательное — просрочка. */
  daysLeft: number | null;
  activeApplications: number;
};

/**
 * Очередь уничтожения для экрана ПДн.
 *
 * Сортировка по сроку, а не по дате добавления: важно не «кто раньше
 * пришёл», а «где мы ближе всего к нарушению».
 */
export async function listErasureQueue(
  actor: Actor,
  now: Date = new Date(),
): Promise<ErasureQueueItem[]> {
  const candidates = await prismaRaw.candidate.findMany({
    where: {
      organizationId: actor.organizationId,
      erasureState: { in: ["BLOCKED_FOR_ERASURE", "ERASURE_PENDING"] },
    },
    select: {
      id: true,
      fullName: true,
      erasureState: true,
      erasureReason: true,
      erasureRequestedAt: true,
      erasureDueAt: true,
      applications: { select: { outcome: true } },
    },
  });

  return candidates
    .map((c) => ({
      id: c.id,
      fullName: c.fullName,
      state: c.erasureState,
      reason: c.erasureReason,
      requestedAt: c.erasureRequestedAt,
      dueAt: c.erasureDueAt,
      daysLeft: c.erasureDueAt
        ? Math.ceil((c.erasureDueAt.getTime() - now.getTime()) / DAY)
        : null,
      activeApplications: c.applications.filter(
        (a) => a.outcome === "IN_PROGRESS",
      ).length,
    }))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

/** Сколько кандидатов уже просрочено — цифра для предупреждения. */
export async function countOverdueErasures(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  return prismaRaw.candidate.count({
    where: {
      organizationId,
      erasureState: { in: ["BLOCKED_FOR_ERASURE", "ERASURE_PENDING"] },
      erasureDueAt: { lt: now },
    },
  });
}

/**
 * Кандидаты, которых фоновая задача обязана уничтожить прямо сейчас.
 *
 * Два случая: человек уже поставил в очередь (ERASURE_PENDING) или
 * подошёл крайний срок по закону — тогда ждать решения человека нельзя,
 * тридцать дней кончились.
 */
export function dueForErasureFilter(now: Date = new Date()) {
  return {
    OR: [
      { erasureState: "ERASURE_PENDING" as const },
      {
        erasureState: "BLOCKED_FOR_ERASURE" as const,
        erasureDueAt: { lte: now },
      },
    ],
  };
}

/**
 * Кандидаты, у которых согласие перестало действовать, а блокировки ещё нет.
 *
 * Правило «действует ли согласие» здесь повторено, а не взято из
 * consent.ts (consentIsValid / expiredConsentFilter): consent.ts сам
 * зависит от этого модуля (отзыв блокирует), и обратный импорт замкнул
 * бы их друг на друга. Меняешь правило там — поменяй и здесь.
 *
 * prisma, а не prismaRaw: обезличенные кнопкой до появления контура
 * числятся ACTIVE, но удалены мягко (deletedAt) — блокировать
 * и уничтожать их второй раз нечего.
 */
export async function candidatesWithoutValidConsent(now: Date = new Date()) {
  return prisma.candidate.findMany({
    where: {
      erasureState: "ACTIVE",
      OR: [
        { consentStatus: "REVOKED" },
        { consentStatus: "EXPIRED" },
        { consentStatus: "GIVEN", consentExpiresAt: { lt: now } },
        { consentStatus: "GIVEN", consentExpiresAt: null },
      ],
    },
    select: { id: true, organizationId: true, consentStatus: true },
  });
}
