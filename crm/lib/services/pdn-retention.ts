import type { Actor } from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import {
  consentIsValid,
  expiredConsentFilter,
} from "@/lib/services/consent";
import { expiredDisclosureFilter } from "@/lib/services/disclosure-consent";
import {
  blockForErasure,
  candidatesWithoutValidConsent,
  dueForErasureFilter,
} from "@/lib/services/erasure";
import { STUDENT_PROFILE_ID_PREFIX } from "@/lib/services/student-profile-audit";
import { expiredSourcingLeads } from "@/lib/services/sourcing";
import {
  STUDENT_APPLICATION_TARGET_PREFIX,
  STUDENT_FILE_TARGET_PREFIX,
} from "@/lib/services/student-file-audit";
import { ROLE_LABELS } from "@/lib/labels";
import { getStorage } from "@/lib/storage/client";

export class RetentionError extends Error {}

/**
 * Сроки хранения и удаление персональных данных (BR-34, BR-35).
 *
 * Механизмы:
 *  — истечение согласия наступает само по времени (expireConsents);
 *  — отзыв или истечение блокируют обработку и назначают срок
 *    уничтожения, а по сроку runErasureQueue обезличивает сам, без
 *    участия человека (ст. 21 152-ФЗ, lib/services/erasure.ts);
 *  — владелец может удалить сразу, не дожидаясь срока (erasePersonalData);
 *  — исходный файл резюме живёт меньше карточки: 30 дней после закрытия
 *    кандидата или до конца согласия (purgeClosedResumes).
 *
 * Раньше автоматически не стиралось ничего: решение «удалять ли» ждало
 * человека, и если он не нажимал кнопку, данные лежали без основания
 * бессрочно, хотя срок по закону шёл. Кандидат, который ещё нужен, —
 * повод продлить согласие: продление снимает блокировку по сроку.
 */

/** Помечает истёкшие согласия. Запускается фоновой задачей. */
export async function expireConsents(): Promise<number> {
  const result = await prisma.candidate.updateMany({
    // Что считать истёкшим — правило согласия, а не расписания задач:
    // держим его рядом с consentIsValid, которым проверяется
    // представление кандидата клиенту
    where: expiredConsentFilter(),
    data: { consentStatus: "EXPIRED" },
  });

  return result.count;
}

/**
 * Истёкшие подтверждения передачи работодателю (§6.1 документа: не более
 * 90 календарных дней).
 *
 * Отдельной задачей от expireConsents, а не общим проходом: это другой
 * документ, другой срок и другая таблица. Правило истечения держим
 * рядом с disclosureIsValid, которым проверяется представление, — одно
 * правило в двух местах однажды разъедется.
 */
export async function expireDisclosureConsents(): Promise<number> {
  const result = await prisma.disclosureConsent.updateMany({
    where: expiredDisclosureFilter(),
    data: { status: "EXPIRED" },
  });

  return result.count;
}

/**
 * Сколько исходный файл резюме живёт после закрытия кандидата.
 *
 * Политика (раздел 8) обещает, что исходный файл не хранится постоянно,
 * но числа не называет — оно в Матрице сроков хранения, внутреннем
 * документе Оператора. Закон конкретного срока тоже не задаёт: статья 5
 * 152-ФЗ говорит «не дольше, чем требует цель». Тридцать дней после
 * закрытия — решение заказчика от 19.09.2026: к этому моменту данные
 * из резюме давно перенесены в карточку, а сам файл нужен разве что
 * на случай спора по недавнему отказу.
 */
const RESUME_DAYS_AFTER_CLOSE = 30;

/** Заявки в этих исходах считаются закрытыми. ON_HOLD — пауза, не закрытие. */
const CLOSED_OUTCOMES = new Set(["HIRED", "REJECTED", "WITHDRAWN"]);

/**
 * Удаление исходных файлов резюме (Политика, раздел 8).
 *
 * Удаляется именно файл, а не карточка: сведения из резюме перенесены
 * в профиль кандидата и живут по общему согласию (12 месяцев), а сырой
 * документ — неконтролируемый: в него человек мог вложить скан паспорта,
 * справку, фотографию. Их мы не запрашивали и хранить не должны.
 *
 * Кого трогаем:
 *   — кандидатов, у которых нет ни одной заявки в работе, и последняя
 *     активность по заявкам старше 30 дней;
 *   — всех, у кого общее согласие перестало действовать, независимо
 *     от заявок: «не позже окончания согласия» сильнее тридцати дней.
 *
 * Кого не трогаем: кандидатов без заявок вовсе — их файл живёт до конца
 * согласия и уходит вместе с ним через erasePersonalData. Удалять резюме
 * человеку, которого ещё никому не показывали, значит потерять смысл
 * его присутствия в базе.
 *
 * Точной даты закрытия у заявки нет, берём updatedAt. Он меняется при
 * любой правке, то есть всегда не раньше закрытия: ошибка возможна
 * только в сторону «подержали дольше», и это лучше, чем удалить файл
 * по кандидату, с которым вчера ещё работали.
 *
 * Идемпотентна: повторный проход видит уже помеченные файлы и проходит
 * мимо. Сбой удаления в хранилище не роняет задачу — запись останется
 * непомеченной, и следующий проход попробует снова.
 */
export async function purgeClosedResumes(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RESUME_DAYS_AFTER_CLOSE * 86_400_000);

  const attachments = await prismaRaw.attachment.findMany({
    where: { kind: "RESUME", deletedAt: null },
    select: {
      id: true,
      storageKey: true,
      organizationId: true,
      candidate: {
        select: {
          id: true,
          consentStatus: true,
          consentExpiresAt: true,
          applications: { select: { outcome: true, updatedAt: true } },
        },
      },
      application: {
        select: {
          candidate: {
            select: {
              id: true,
              consentStatus: true,
              consentExpiresAt: true,
              applications: { select: { outcome: true, updatedAt: true } },
            },
          },
        },
      },
    },
  });

  let purged = 0;

  for (const attachment of attachments) {
    // Резюме привязано либо к кандидату, либо к заявке — берём того,
    // кто нашёлся: проверять надо согласие человека, а не место ссылки
    const candidate = attachment.candidate ?? attachment.application?.candidate;
    if (!candidate) continue;

    /*
      «Кончилось» — значит было и перестало: отозвано, истекло или выдано
      без срока. PENDING сюда не относится: согласия ещё не было —
      кандидата только завели вместе с резюме, ссылка ушла, — и удалить
      файл через минуту после загрузки значило бы сорвать представление
      («приложите резюме»). Такой кандидат живёт по правилу закрытия,
      как и все. В CRM агентства PENDING попадал сюда по ошибке: правило
      consentIsValid отвечает «можно ли обрабатывать», а не «кончилось ли».
    */
    const consentGone =
      candidate.consentStatus !== "PENDING" &&
      !consentIsValid(candidate.consentStatus, candidate.consentExpiresAt, now);

    let due = consentGone;
    if (!due) {
      const apps = candidate.applications;
      const anyOpen = apps.some((a) => !CLOSED_OUTCOMES.has(a.outcome));
      const lastTouch = apps.reduce<Date | null>(
        (max, a) => (max === null || a.updatedAt > max ? a.updatedAt : max),
        null,
      );
      due = apps.length > 0 && !anyOpen && lastTouch !== null && lastTouch < cutoff;
    }
    if (!due) continue;

    // Сначала хранилище, потом отметка в базе: при обратном порядке
    // сбой оставил бы файл в S3 без единой ссылки на него
    try {
      await getStorage().delete(attachment.storageKey);
    } catch (error) {
      console.error(`[ПДн] резюме не удалено: ${attachment.storageKey}`, error);
      continue;
    }

    await prismaRaw.$transaction([
      prismaRaw.attachment.update({
        where: { id: attachment.id },
        data: { deletedAt: now },
      }),
      prismaRaw.personalDataAccessLog.create({
        data: {
          organizationId: attachment.organizationId,
          // Действие системы, не человека: инициатором записан кандидат,
          // как и при получении согласия
          actorId: candidate.id,
          candidateId: candidate.id,
          action: consentGone
            ? "resume_purged_consent_over"
            : "resume_purged_after_close",
        },
      }),
    ]);
    purged++;
  }

  return purged;
}

export type RetentionCandidate = {
  id: string;
  fullName: string;
  consentStatus: string;
  consentExpiresAt: Date | null;
  lastActivityAt: Date;
  activeApplications: number;
};

/**
 * Кандидаты, чьи данные подлежат удалению или обезличиванию.
 *
 * Кандидаты в активной работе не исключаются, а помечаются числом
 * заявок: удалять данные посреди подбора — повод сначала попросить
 * продлить согласие.
 */
export async function listForRetention(
  actor: Actor,
): Promise<RetentionCandidate[]> {
  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId: actor.organizationId,
      consentStatus: { in: ["EXPIRED", "REVOKED"] },
    },
    select: {
      id: true,
      fullName: true,
      consentStatus: true,
      consentExpiresAt: true,
      updatedAt: true,
      applications: {
        select: { outcome: true },
      },
    },
  });

  return candidates
    .map((candidate) => ({
      id: candidate.id,
      fullName: candidate.fullName,
      consentStatus: candidate.consentStatus,
      consentExpiresAt: candidate.consentExpiresAt,
      lastActivityAt: candidate.updatedAt,
      activeApplications: candidate.applications.filter(
        (a) => a.outcome === "IN_PROGRESS",
      ).length,
    }))
    .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
}

/**
 * Физическое удаление персональных данных кандидата (BR-35).
 *
 * Именно физическое, а не мягкое: право на удаление означает, что
 * данных не остаётся, а не что они помечены флагом.
 *
 * При этом `Application` сохраняется обезличенным: воронка, конверсии
 * и статистика по вакансиям строятся на нём, и стирание записи
 * переписало бы историю работы агентства. Обезличенный кандидат —
 * это «Кандидат #1234» без единого контакта.
 */
export async function erasePersonalData(
  actor: Actor,
  candidateId: string,
): Promise<{ erasedFiles: number }> {
  return anonymizeCandidate({
    candidateId,
    organizationId: actor.organizationId,
    actorId: actor.id,
  });
}

/**
 * Само обезличивание, без актора.
 *
 * Выделено из erasePersonalData, потому что то же самое делает фоновая
 * задача по очереди уничтожения, а у неё сотрудника-инициатора нет:
 * действует обязанность оператора, а не чьё-то решение. Инициатором
 * в журнале в таком случае записан сам кандидат — как и при получении
 * согласия, где действие тоже его, а не наше.
 */
export async function anonymizeCandidate(params: {
  candidateId: string;
  organizationId: string;
  actorId: string;
}): Promise<{ erasedFiles: number }> {
  const { candidateId, organizationId, actorId } = params;

  const candidate = await prismaRaw.candidate.findFirst({
    where: { id: candidateId, organizationId },
    select: {
      id: true,
      attachments: { select: { id: true, storageKey: true } },
    },
  });
  if (!candidate) throw new RetentionError("Кандидат не найден");

  // Файлы удаляем из хранилища до записи в БД: иначе при сбое
  // останутся резюме, на которые уже нет ссылок
  let erasedFiles = 0;
  for (const attachment of candidate.attachments) {
    try {
      await getStorage().delete(attachment.storageKey);
      erasedFiles++;
    } catch (error) {
      console.error(`[ПДн] файл не удалён: ${attachment.storageKey}`, error);
    }
  }

  const anonymousName = `Кандидат #${candidateId.slice(-6)}`;

  await prismaRaw.$transaction([
    prismaRaw.attachment.deleteMany({ where: { candidateId } }),

    // Обезличивание вместо удаления: статистика остаётся,
    // персональных данных не остаётся
    prismaRaw.candidate.update({
      where: { id: candidateId },
      data: {
        fullName: anonymousName,
        phone: null,
        email: null,
        telegram: null,
        city: null,
        birthYear: null,
        currentPosition: null,
        currentCompany: null,
        education: null,
        summary: null,
        skills: [],
        sourceDetails: null,
        consentStatus: "REVOKED",
        consentToken: null,
        consentDocUrl: null,
        deletedAt: new Date(),
        // Контур уничтожения закрыт: состояние терминальное, и по нему
        // же moveStage и presentToClient не пустят к заявкам обезличенного
        erasureState: "ANONYMIZED",
        erasedAt: new Date(),
      },
    }),

    // Саммари представления содержит рассказ о человеке — тоже ПДн
    prismaRaw.application.updateMany({
      where: { candidateId },
      data: { presentationSummary: null },
    }),

    prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId,
        actorId,
        candidateId,
        action: "erased",
      },
    }),
  ]);

  return { erasedFiles };
}

/**
 * Проход по контуру уничтожения (ст. 21 152-ФЗ).
 *
 * Две части, и порядок важен:
 *
 * 1. Новые основания. Согласие отозвано или кончилось — обработка
 *    обязана прекратиться, а не ждать, пока кто-то заметит строку
 *    в списке. Кандидат блокируется, срок уничтожения назначается.
 * 2. Исполнение. Обезличиваются те, кого человек поставил в очередь,
 *    и те, у кого вышли тридцать дней. Второе — не наша строгость,
 *    а предел, за которым начинается нарушение.
 *
 * Идемпотентна: blockForErasure не трогает уже заблокированных и не
 * продлевает им срок, обезличенные из выборок выпадают сами.
 */
export async function runErasureQueue(
  now: Date = new Date(),
): Promise<{ заблокировано: number; обезличено: number }> {
  let blocked = 0;
  for (const candidate of await candidatesWithoutValidConsent(now)) {
    const started = await blockForErasure({
      candidateId: candidate.id,
      organizationId: candidate.organizationId,
      reason:
        candidate.consentStatus === "REVOKED"
          ? "CONSENT_REVOKED"
          : "CONSENT_EXPIRED",
      // Инициатор — сам кандидат: основание возникло из его согласия
      // или его отзыва, а не из решения сотрудника
      actorId: candidate.id,
      now,
    });
    if (started) blocked++;
  }

  // Сорсинг-лид без согласия за 14 дней — то же основание «обработку
  // прекратить», та же дорога и тот же журнал (lib/services/sourcing.ts)
  for (const candidate of await expiredSourcingLeads(now)) {
    const started = await blockForErasure({
      candidateId: candidate.id,
      organizationId: candidate.organizationId,
      reason: "SOURCING_EXPIRED",
      // Инициатор — не сотрудник: основание возникло по сроку
      actorId: candidate.id,
      now,
    });
    if (started) blocked++;
  }

  const due = await prismaRaw.candidate.findMany({
    where: dueForErasureFilter(now),
    select: { id: true, organizationId: true },
  });

  let erased = 0;
  for (const candidate of due) {
    try {
      await anonymizeCandidate({
        candidateId: candidate.id,
        organizationId: candidate.organizationId,
        actorId: candidate.id,
      });
      erased++;
    } catch (error) {
      // Один сбойный кандидат не должен останавливать очередь: остальные
      // ждут своих сроков, и пропустить их дороже
      console.error(`[ПДн] не обезличен ${candidate.id}`, error);
    }
  }

  return { заблокировано: blocked, обезличено: erased };
}

export type AccessLogEntry = {
  id: string;
  action: string;
  createdAt: Date;
  ip: string | null;
  actorName: string;
  /** Роль сотрудника по его учётной записи; у записи самого кандидата её нет. */
  actorRole: string | null;
  candidateName: string;
};

/**
 * Чем подписать объект записи, если это документ студента, а не кандидат.
 * Имени студента в журнале нет и не будет: только вид документа и начало
 * идентификатора (по нему запись находят в студенческой платформе).
 */
function studentTargetLabel(action: string, candidateId: string): string | null {
  const short = (prefix: string) => candidateId.slice(prefix.length).slice(0, 8);
  if (candidateId.startsWith(STUDENT_FILE_TARGET_PREFIX)) {
    const id = short(STUDENT_FILE_TARGET_PREFIX);
    return action === "student_study_view"
      ? `Справка студента, файл ${id}`
      : `Фото студента, файл ${id}`;
  }
  if (candidateId.startsWith(STUDENT_APPLICATION_TARGET_PREFIX)) {
    return `Отклик студента ${short(STUDENT_APPLICATION_TARGET_PREFIX)}`;
  }
  return null;
}

/** Журнал доступа к персональным данным (BR-36). Только владельцу. */
export async function listAccessLog(
  actor: Actor,
  filters: { candidateId?: string; actorId?: string; limit?: number } = {},
): Promise<AccessLogEntry[]> {
  const entries = await prisma.personalDataAccessLog.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(filters.candidateId && { candidateId: filters.candidateId }),
      ...(filters.actorId && { actorId: filters.actorId }),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 200,
  });

  const actorIds = [...new Set(entries.map((e) => e.actorId))];
  const candidateIds = [
    ...new Set(
      entries
        .map((e) => e.candidateId)
        // Метки документов студентов — не id кандидатов, в базе их не ищем
        .filter((id) => studentTargetLabel("", id) === null),
    ),
  ];

  const [users, candidates] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, role: true },
    }),
    // Удалённые тоже показываем: журнал должен пережить удаление
    prismaRaw.candidate.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, fullName: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u.fullName]));
  const roleById = new Map(users.map((u) => [u.id, ROLE_LABELS[u.role]]));
  const candidateById = new Map(candidates.map((c) => [c.id, c.fullName]));

  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    createdAt: entry.createdAt,
    ip: entry.ip,
    // Если действие совершил сам кандидат (дал согласие), в actorId
    // лежит его id, а не сотрудника
    actorName:
      userById.get(entry.actorId) ??
      candidateById.get(entry.actorId) ??
      "—",
    actorRole: roleById.get(entry.actorId) ?? null,
    candidateName: entry.candidateId.startsWith(STUDENT_PROFILE_ID_PREFIX)
      ? // Студент платформы: в таблице кандидатов его нет, ФИО в журнал не пишется
        `Студент платформы (…${entry.candidateId.slice(-6)})`
      : (studentTargetLabel(entry.action, entry.candidateId) ??
        candidateById.get(entry.candidateId) ??
        "удалён"),
  }));
}

/** Человеку понятные названия действий в журнале. */
export const ACCESS_ACTION_LABELS: Record<string, string> = {
  view: "Просмотр карточки",
  download_file: "Скачивание файла",
  export: "Выгрузка отчёта",
  consent_given: "Согласие получено",
  consent_revoked: "Согласие отозвано",
  erased: "Данные удалены",
  disclosure_consent_given: "Подтверждена передача работодателю",
  disclosure_consent_marked_manually: "Передача работодателю отмечена вручную",
  resume_purged_after_close: "Файл резюме удалён по сроку хранения",
  resume_purged_consent_over: "Файл резюме удалён: согласие кончилось",
  erasure_blocked: "Обработка прекращена, назначен срок уничтожения",
  erasure_queued: "Поставлено в очередь на уничтожение",
  student_photo_view: "Просмотр фото студента",
  student_study_view: "Просмотр справки студента",
  student_applicant_photo_view: "Просмотр фото откликнувшегося студента",
  student_applicant_resume_view: "Просмотр резюме откликнувшегося студента",
  sourcing_notice_sent: "Кандидат уведомлён, что его данные у нас (сорсинг)",
  student_profile_view: "Просмотр анкеты студента платформы",
  student_profile_contacts_view: "Показаны контакты студента платформы",
};
