/**
 * Сорсинг-лид: человек, которого рекрутер нашёл сам.
 *
 * Отличается от обычного кандидата одним: данные получены НЕ от него.
 * Он не оставлял отклик, не заполнял анкету и вообще о нас не знает.
 * Из этого следует режим, который написал юрист, и все ограничения
 * ниже — его пункты, а не наша осторожность.
 *
 * 1. МИНИМУМ ПОЛЕЙ. До согласия храним только то, без чего нельзя
 *    связаться: имя, контакты, ссылку на профиль. Ни должности,
 *    ни компании, ни зарплатных ожиданий, ни заметок рекрутера,
 *    ни файлов — в резюме всё то же самое разом. Строго по букве —
 *    решение заказчика (подтверждено 03.10.2026).
 *
 * 2. УВЕДОМЛЕНИЕ ПЕРВЫМ ДЕЙСТВИЕМ. Статья 18 152-ФЗ: если данные
 *    получены не от субъекта, оператор обязан его известить — кто мы,
 *    откуда данные, зачем и какие у него права. Не «когда-нибудь
 *    потом», а до того, как с данными начнут работать.
 *
 * 3. СРОК ЖИЗНИ. Нет согласия за две недели — обработка прекращается,
 *    и данные уходят в общий контур уничтожения (lib/services/erasure.ts,
 *    причина SOURCING_EXPIRED). Согласие, полученное по ссылке, пока
 *    уничтожение не исполнено, снимает блокировку: основание появилось.
 *
 * 4. КЛИЕНТУ НЕ ПЕРЕДАЁТСЯ. Это уже работало и раньше: без согласия
 *    presentToClient() не пускает.
 *
 * Режим кончается в момент получения согласия: человек узнал о нас
 * и разрешил обработку, дальше он обычный кандидат. Перенесено
 * из CRM агентства, где этот модуль был написан, но ни к чему не
 * подключён, — здесь подключено к заведению, файлам и уничтожению.
 */

import { prisma, prismaRaw } from "@/lib/db/prisma";
import {
  isSourcingLead,
  restrictedFieldsIn,
  SOURCING_FILES_MESSAGE,
  SOURCING_LEAD_TTL_DAYS,
  SOURCING_REMINDER_DAYS_BEFORE,
} from "@/lib/sourcing";

// Правила режима — в lib/sourcing.ts: без базы, их берут и клиентские
// компоненты. Здесь — то, что ходит в базу
export * from "@/lib/sourcing";

export class SourcingError extends Error {}

const DAY = 86_400_000;

/**
 * Проверить поля и объяснить, если нельзя.
 *
 * Бросает, а не молча отбрасывает лишнее: рекрутер должен понять,
 * почему его заметка не сохранилась, иначе он решит, что система
 * теряет данные, и заведёт вторую карточку.
 */
export function assertFieldsAllowed(
  candidate: { sourcedAt: Date | string | null; consentStatus: string },
  input: Record<string, unknown>,
): void {
  if (!isSourcingLead(candidate)) return;
  const forbidden = restrictedFieldsIn(input);
  if (forbidden.length === 0) return;

  throw new SourcingError(
    `Пока кандидат не дал согласие, можно хранить только имя, контакты ` +
      `и ссылку на профиль. Уберите: ${forbidden.join(", ")}. ` +
      `Получите согласие — поля откроются.`,
  );
}

/** Новый кандидат — всегда сорсинг-лид: согласия при заведении нет ни у кого. */
export function assertNewCandidateFields(input: Record<string, unknown>): void {
  assertFieldsAllowed({ sourcedAt: new Date(), consentStatus: "PENDING" }, input);
}

/**
 * Файлы к сорсинг-лиду не сохраняются. Вызывать до загрузки в хранилище:
 * отказ после неё оставил бы файл, на который не ссылается ни одна запись.
 */
export async function assertFilesAllowed(
  organizationId: string,
  target: { candidateId?: string; applicationId?: string },
): Promise<void> {
  const select = { sourcedAt: true, consentStatus: true } as const;
  const candidate = target.candidateId
    ? await prisma.candidate.findFirst({
        where: { id: target.candidateId, organizationId },
        select,
      })
    : target.applicationId
      ? ((
          await prisma.application.findFirst({
            where: { id: target.applicationId, organizationId },
            select: { candidate: { select } },
          })
        )?.candidate ?? null)
      : null;

  if (candidate && isSourcingLead(candidate)) throw new SourcingError(SOURCING_FILES_MESSAGE);
}

/**
 * Отметить, что человека уведомили.
 *
 * Отдельно от отправки письма: уведомить можно и голосом, если известен
 * только телефон. Кто отметил, видно в журнале ПДн. Повторная отметка
 * первую не переписывает — важно, когда уведомили впервые.
 */
export async function markSourcingNotice(params: {
  candidateId: string;
  organizationId: string;
  actorId: string;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const [updated] = await prismaRaw.$transaction([
    prismaRaw.candidate.updateMany({
      where: {
        id: params.candidateId,
        organizationId: params.organizationId,
        sourcingNoticeAt: null,
      },
      data: { sourcingNoticeAt: now },
    }),
    prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        candidateId: params.candidateId,
        action: "sourcing_notice_sent",
      },
    }),
  ]);
  return updated.count > 0;
}

/**
 * Сорсинг-лиды, у которых вышел срок.
 *
 * Не блокируем здесь сами: уничтожением занимается общий контур
 * (runErasureQueue), туда и передаём. Так у любого уничтожения одна
 * дорога и один журнал, а не две похожие реализации, которые однажды
 * разойдутся.
 *
 * prisma, а не prismaRaw: обезличенные кнопкой удалены мягко, второй
 * раз их блокировать нечего.
 */
export async function expiredSourcingLeads(now: Date = new Date()) {
  return prisma.candidate.findMany({
    where: {
      sourcedAt: { lte: new Date(now.getTime() - SOURCING_LEAD_TTL_DAYS * DAY) },
      consentStatus: "PENDING",
      erasureState: "ACTIVE",
    },
    select: { id: true, organizationId: true },
  });
}

/**
 * Кому пора напомнить: до срока осталось не больше трёх дней, а напоминания
 * ещё не было. Уже истёкшие сюда тоже попадают, если напомнить не успели, —
 * письмо скажет, что обработка прекращена и что делать.
 */
export async function sourcingLeadsToRemind(now: Date = new Date()) {
  const remindFrom = new Date(
    now.getTime() - (SOURCING_LEAD_TTL_DAYS - SOURCING_REMINDER_DAYS_BEFORE) * DAY,
  );
  return prisma.candidate.findMany({
    where: {
      sourcedAt: { lte: remindFrom },
      consentStatus: "PENDING",
      sourcingReminderAt: null,
      erasureState: { in: ["ACTIVE", "BLOCKED_FOR_ERASURE"] },
    },
    select: {
      id: true,
      organizationId: true,
      fullName: true,
      createdById: true,
      sourcedAt: true,
    },
  });
}
