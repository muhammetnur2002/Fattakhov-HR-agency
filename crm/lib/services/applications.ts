import {
  stripInternal,
  visibleApplicationsFilter,
  visibleAttachmentsFilter,
  type Actor,
} from "@/lib/access";
import { isUniqueViolation } from "@/lib/db/errors";
import { getActiveAgreement } from "@/lib/services/agreements";
import { consentIsValid } from "@/lib/services/consent";
import { findValidDisclosure } from "@/lib/services/disclosure-consent";
import {
  erasureBlockMessage,
  erasureBlocksProcessing,
  liftExpiredConsentBlock,
} from "@/lib/services/erasure";
import { prisma } from "@/lib/db/prisma";
import { link } from "@/lib/notifications/links";
import { plain } from "@/lib/db/serialize";
import type { ClientDecision } from "@/lib/generated/prisma/enums";
import { truncateBody } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/notify";
import {
  agencySideRecipients,
  clientSideRecipients,
} from "@/lib/notifications/recipients";
import { REJECTION_REASON_LABELS } from "@/lib/labels";
import type {
  GuaranteeCaseInput,
  OfferInput,
  RejectInput,
} from "@/lib/validation/candidate";

export class ApplicationError extends Error {}

/**
 * Добавление кандидата в воронку.
 *
 * BR-6: один человек не может быть в одной вакансии дважды — на это
 * стоит уникальный индекс, но сообщение об ошибке должно вести
 * к существующей карточке, а не показывать текст про constraint.
 */
export async function addToVacancy(
  actor: Actor,
  vacancyId: string,
  candidateId: string,
) {
  const [vacancy, candidate, existing] = await Promise.all([
    prisma.vacancy.findFirst({
      where: { id: vacancyId, organizationId: actor.organizationId },
      select: {
        id: true,
        status: true,
        stages: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
      },
    }),
    prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: actor.organizationId },
      select: { id: true },
    }),
    prisma.application.findFirst({
      where: { vacancyId, candidateId },
      select: { id: true },
    }),
  ]);

  if (!vacancy) throw new ApplicationError("Вакансия не найдена");
  if (!candidate) throw new ApplicationError("Кандидат не найден");
  if (existing) {
    throw new ApplicationError(
      "Этот кандидат уже в воронке этой вакансии",
    );
  }

  const firstStage = vacancy.stages[0];
  if (!firstStage) {
    throw new ApplicationError(
      "У вакансии нет воронки — она ещё не запущена в работу",
    );
  }

  /*
    Заявка и первая запись в истории пишутся вместе.

    Порознь они могли разойтись: заявка создана, а «Добавлен в воронку»
    в историю не попало — и карточка кандидата начинается с пустоты,
    хотя в воронке он стоит.

    Проверка `existing` выше ловит обычный случай, но между ней
    и вставкой помещается второй такой же вызов — два клика по кнопке
    «Добавить», две вкладки. Тогда отказывает уникальный индекс (BR-6),
    и его отказ надо назвать теми же словами: иначе человек, дважды
    нажавший кнопку, увидит «Что-то пошло не так» вместо «он уже здесь».
  */
  try {
    return await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          organizationId: actor.organizationId,
          vacancyId,
          candidateId,
          stageId: firstStage.id,
          ownerId: actor.id,
        },
        select: { id: true },
      });

      await tx.stageTransition.create({
        data: {
          applicationId: application.id,
          toStageId: firstStage.id,
          toOutcome: "IN_PROGRESS",
          actorId: actor.id,
          comment: "Добавлен в воронку",
        },
      });

      return application;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApplicationError("Этот кандидат уже в воронке этой вакансии");
    }
    throw error;
  }
}

/**
 * Перевод по этапам (ТЗ 6.2).
 *
 * Вперёд можно перепрыгивать через этапы, назад — только с
 * комментарием: возврат кандидата это всегда история, которую потом
 * кто-то будет разбирать.
 */
export async function moveStage(
  actor: Actor,
  applicationId: string,
  toStageId: string,
  comment?: string,
) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      stageId: true,
      stageEnteredAt: true,
      outcome: true,
      vacancyId: true,
      offerSalary: true,
      offerStartDate: true,
      stage: { select: { order: true } },
      candidate: { select: { erasureState: true } },
      vacancy: { select: { clientId: true } },
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  /*
    Заблокированные данные не двигаются по воронке. Блокировка по ст. 21
    152-ФЗ означает прекращение обработки, а перевод на этап — обработка
    и есть: меняется запись, уходит уведомление, кандидат появляется
    у клиента. Проверка здесь, а не только в интерфейсе: карточку тянут
    мышью на доске и переводят пачкой, и запрет обязан жить в сервисе.
  */
  if (erasureBlocksProcessing(application.candidate.erasureState)) {
    throw new ApplicationError(
      erasureBlockMessage(application.candidate.erasureState),
    );
  }

  if (application.stageId === toStageId) return { moved: false };

  const toStage = await prisma.pipelineStage.findFirst({
    where: { id: toStageId, vacancyId: application.vacancyId },
    select: { id: true, order: true, code: true },
  });
  if (!toStage) {
    throw new ApplicationError("Этап не принадлежит этой вакансии");
  }

  const movingBack = toStage.order < application.stage.order;
  if (movingBack && !comment?.trim()) {
    throw new ApplicationError(
      "Возврат на предыдущий этап — с комментарием: что случилось",
    );
  }

  // Перевод в «Представлен» — отдельная операция со своими проверками
  if (toStage.code === "PRESENTED") {
    throw new ApplicationError(
      "Для представления клиенту используйте отдельное действие: нужны саммари и резюме",
    );
  }

  const now = new Date();
  const hoursInPreviousStage =
    (now.getTime() - application.stageEnteredAt.getTime()) / 3_600_000;

  /*
    Найм — не просто перенос карточки на этап HIRED («Вышел на работу»).

    Раньше он им и был: этап менялся, а исход, дата найма, срок гарантии
    оставались пустыми. На них при этом держится всё, что после найма:
    список к выставлению счёта (outcome HIRED и hiredAt), аналитика
    наймов за период, гарантия замены (BR-10) и удаление исходного резюме
    через 30 дней после закрытия кандидата. В тестовых данных этого не
    было видно — seed записывает эти поля напрямую, — а на живых данных
    ни один найм не попал бы в счёт.

    Без суммы оффера не нанимаем: вознаграждение считается от неё
    (BR-31), и найм без неё — счёт, который потом не из чего посчитать.
    Гарантия отсчитывается от даты выхода, если она известна: замену
    обещают на срок работы человека, а не на срок с момента нажатия.
  */
  const hiring = toStage.code === "HIRED";
  const leavingHire = application.outcome === "HIRED" && !hiring;

  let hireData: {
    outcome: "HIRED";
    hiredAt: Date;
    guaranteeUntil: Date | null;
    guaranteeBrokenAt: null;
    guaranteeBreakReason: null;
    guaranteeBreakComment: null;
    replacementForId: string | null;
  } | null = null;

  if (hiring) {
    if (application.offerSalary === null) {
      throw new ApplicationError(
        "Перед наймом внесите сумму оффера: от неё считается вознаграждение, " +
          "и без неё счёт за этого кандидата не выставится.",
      );
    }

    // Тот же договор, по которому запускают вакансию (BR-1) и считают
    // счёт: срок гарантии — его условие, а не общее правило агентства
    const agreement = await getActiveAgreement(application.vacancy.clientId);
    const guaranteeStart = application.offerStartDate ?? now;

    /*
      Замена по гарантии. Если по этой вакансии есть гарантийный случай,
      для которого замены ещё нет, этот найм — она и есть. Отмечаем, чтобы
      его не выставили в счёт: за подбор уже заплачено исходным наймом,
      а гарантия и означает, что замену агентство ищет бесплатно.
    */
    const brokenHires = await prisma.application.findMany({
      where: {
        vacancyId: application.vacancyId,
        guaranteeBrokenAt: { not: null },
        id: { not: application.id },
      },
      orderBy: { guaranteeBrokenAt: "asc" },
      select: { id: true },
    });
    const covered = brokenHires.length
      ? await prisma.application.findMany({
          where: { replacementForId: { in: brokenHires.map((b) => b.id) } },
          select: { replacementForId: true },
        })
      : [];
    const coveredIds = new Set(covered.map((c) => c.replacementForId));
    const replaces = brokenHires.find((b) => !coveredIds.has(b.id));

    hireData = {
      outcome: "HIRED",
      hiredAt: now,
      guaranteeUntil: agreement
        ? new Date(guaranteeStart.getTime() + agreement.guaranteeDays * 86_400_000)
        : null,
      // Новый найм начинает гарантию с чистого листа: случай от прежнего
      // найма этой же заявки (его вернули с этапа найма) к нему не относится
      guaranteeBrokenAt: null,
      guaranteeBreakReason: null,
      guaranteeBreakComment: null,
      replacementForId: replaces?.id ?? null,
    };
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: {
        stageId: toStageId,
        stageEnteredAt: now,
        // Возврат в работу с отказа — снимаем причину, иначе она
        // останется висеть на активном кандидате
        ...(application.outcome !== "IN_PROGRESS" && {
          outcome: "IN_PROGRESS",
          rejectionReason: null,
          rejectionComment: null,
          rejectedBy: null,
        }),
        // Отмена найма: человек не вышел или найм внесли по ошибке.
        // Без сброса он остался бы в списке к оплате и в наймах периода.
        // Сорвалась и замена: гарантийный случай снова ждёт своего найма
        ...(leavingHire && {
          hiredAt: null,
          guaranteeUntil: null,
          replacementForId: null,
        }),
        ...hireData,
      },
    }),
    prisma.stageTransition.create({
      data: {
        applicationId,
        fromStageId: application.stageId,
        toStageId,
        fromOutcome: application.outcome,
        toOutcome: hiring ? "HIRED" : "IN_PROGRESS",
        comment: comment?.trim() || null,
        hoursInPreviousStage,
        actorId: actor.id,
      },
    }),
  ]);

  return { moved: true };
}

/**
 * Представление кандидата клиенту (BR-4, BR-5).
 *
 * Это порог: с этого момента карточка становится видимой клиенту,
 * поэтому проверки жёсткие. Показать клиенту кандидата без резюме
 * и без объяснения, почему он подходит, — значит заставить клиента
 * делать работу рекрутера.
 */
export async function presentToClient(
  actor: Actor,
  applicationId: string,
  input: { presentationSummary: string; salaryExpectation: number },
) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      stageId: true,
      stageEnteredAt: true,
      outcome: true,
      candidateId: true,
      vacancyId: true,
      candidate: {
        select: {
          consentStatus: true,
          consentExpiresAt: true,
          erasureState: true,
        },
      },
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  // Тот же запрет, что и в moveStage: передавать клиенту данные,
  // обработка которых прекращена, нельзя тем более
  if (erasureBlocksProcessing(application.candidate.erasureState)) {
    throw new ApplicationError(
      erasureBlockMessage(application.candidate.erasureState),
    );
  }

  // BR-33: без согласия на обработку ПДн передавать данные клиенту нельзя
  // Не только статус, но и срок: EXPIRED проставляет фоновая задача,
  // и до её прохода согласие с истёкшим сроком всё ещё числится GIVEN
  if (
    !consentIsValid(
      application.candidate.consentStatus,
      application.candidate.consentExpiresAt,
    )
  ) {
    throw new ApplicationError(
      "Нет согласия кандидата на обработку персональных данных",
    );
  }

  /*
    §4.2 согласия кандидата и раздел 6 Политики: данные передаются
    конкретному работодателю только после отдельного подтверждения.
    Общего согласия (BR-33) для этого мало — оно разрешает обработку
    у нас, а не передачу наружу. Подтверждение привязано к паре
    «кандидат + вакансия»: на другого работодателя или другую вакансию
    оно не распространяется (§8.1 документа).
  */
  const disclosure = await findValidDisclosure(
    application.candidateId,
    application.vacancyId,
  );
  if (!disclosure) {
    throw new ApplicationError(
      "Нет подтверждения кандидата на передачу данных этому работодателю",
    );
  }

  const [presentedStage, resume] = await Promise.all([
    prisma.pipelineStage.findFirst({
      where: { vacancyId: application.vacancyId, code: "PRESENTED" },
      select: { id: true },
    }),
    prisma.attachment.findFirst({
      where: {
        kind: "RESUME",
        deletedAt: null,
        OR: [
          { candidateId: application.candidateId },
          { applicationId: application.id },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!presentedStage) {
    throw new ApplicationError("В воронке нет этапа «Представлен клиенту»");
  }
  if (!resume) {
    throw new ApplicationError("Приложите резюме — без него не представляем");
  }

  const now = new Date();
  const hoursInPreviousStage =
    (now.getTime() - application.stageEnteredAt.getTime()) / 3_600_000;

  await prisma.$transaction([
    prisma.candidate.update({
      where: { id: application.candidateId },
      data: { salaryExpectation: input.salaryExpectation },
    }),
    prisma.application.update({
      where: { id: applicationId },
      data: {
        stageId: presentedStage.id,
        stageEnteredAt: now,
        outcome: "IN_PROGRESS",
        presentationSummary: input.presentationSummary.trim(),
        presentedAt: now,
        presentedById: actor.id,
      },
    }),
    prisma.stageTransition.create({
      data: {
        applicationId,
        fromStageId: application.stageId,
        toStageId: presentedStage.id,
        fromOutcome: application.outcome,
        toOutcome: "IN_PROGRESS",
        comment: "Представлен клиенту",
        hoursInPreviousStage,
        actorId: actor.id,
      },
    }),
  ]);

  // BR-5: клиент узнаёт о кандидате в момент представления
  const candidate = await prisma.candidate.findFirst({
    where: { id: application.candidateId },
    select: { fullName: true },
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: await clientSideRecipients(application.vacancyId, actor.id),
    event: "CANDIDATE_PRESENTED",
    title: `Новый кандидат: ${candidate?.fullName ?? "без имени"}`,
    body: truncateBody(input.presentationSummary, 300),
    linkUrl: link.application(applicationId),
    // Пятеро кандидатов подряд по одной вакансии — одно письмо, не пять
    groupKey: application.vacancyId,
  });

  return { presentedAt: now };
}

/** Отказ с обязательной причиной (BR-11). */
export async function rejectApplication(
  actor: Actor,
  applicationId: string,
  input: RejectInput,
) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: { id: true, stageId: true, stageEnteredAt: true, outcome: true },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");
  if (application.outcome === "REJECTED") {
    throw new ApplicationError("По кандидату уже зафиксирован отказ");
  }

  const now = new Date();
  const outcome = input.rejectedBy === "CANDIDATE" ? "WITHDRAWN" : "REJECTED";

  await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: {
        outcome,
        rejectionReason: input.rejectionReason,
        rejectionComment: input.rejectionComment ?? null,
        rejectedBy: input.rejectedBy,
      },
    }),
    prisma.stageTransition.create({
      data: {
        applicationId,
        fromStageId: application.stageId,
        toStageId: application.stageId,
        fromOutcome: application.outcome,
        toOutcome: outcome,
        comment: input.rejectionComment ?? null,
        hoursInPreviousStage:
          (now.getTime() - application.stageEnteredAt.getTime()) / 3_600_000,
        actorId: actor.id,
      },
    }),
  ]);

  return { outcome };
}

/**
 * Решение клиента по кандидату (BR-12, BR-13, BR-14).
 *
 * Доступно только после представления: до этого клиент о кандидате
 * не знает, и решать ему нечего.
 *
 * Решение может внести сотрудник агентства со слов клиента — тогда
 * это фиксируется отдельным полем и показывается клиенту плашкой.
 * Прозрачность здесь важнее удобства: иначе в карточке появляется
 * решение, которого клиент не принимал, и никто этого не заметит.
 */
export async function setClientDecision(
  actor: Actor,
  applicationId: string,
  decision: ClientDecision,
  options: {
    /** Обязательна при REJECT (BR-11). */
    rejection?: RejectInput;
    /** true, если решение вносит агентство со слов клиента (BR-14). */
    onBehalf?: boolean;
  } = {},
) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      presentedAt: true,
      outcome: true,
      stageId: true,
      stageEnteredAt: true,
      vacancyId: true,
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  // BR-12: решение возможно только по представленному кандидату
  if (!application.presentedAt) {
    throw new ApplicationError("Кандидат ещё не представлен клиенту");
  }

  const now = new Date();
  const base = {
    clientDecision: decision,
    clientDecisionAt: now,
    clientDecisionById: options.onBehalf ? null : actor.id,
    submittedOnBehalfById: options.onBehalf ? actor.id : null,
  };

  /** Рекрутеру важно узнать о решении сразу — это его следующий шаг. */
  const tellAgency = async (title: string, body?: string) => {
    await notify({
      organizationId: actor.organizationId,
      userIds: await agencySideRecipients(application.vacancyId, actor.id),
      event: "CLIENT_DECISION_MADE",
      title,
      body,
      linkUrl: link.application(applicationId),
    });
  };

  const person = await prisma.application.findFirst({
    where: { id: applicationId },
    select: { candidate: { select: { fullName: true } } },
  });
  const name = person?.candidate.fullName ?? "кандидат";

  if (decision === "REJECT") {
    if (!options.rejection) {
      throw new ApplicationError("Укажите причину отказа");
    }
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        ...base,
        outcome:
          options.rejection.rejectedBy === "CANDIDATE" ? "WITHDRAWN" : "REJECTED",
        rejectionReason: options.rejection.rejectionReason,
        rejectionComment: options.rejection.rejectionComment ?? null,
        rejectedBy: options.rejection.rejectedBy,
      },
    });

    await prisma.stageTransition.create({
      data: {
        applicationId,
        fromStageId: application.stageId,
        toStageId: application.stageId,
        fromOutcome: application.outcome,
        toOutcome: "REJECTED",
        comment: options.rejection.rejectionComment ?? "Отказ клиента",
        actorId: actor.id,
      },
    });

    await tellAgency(
      `Отказ по кандидату ${name}`,
      [
        REJECTION_REASON_LABELS[options.rejection.rejectionReason],
        options.rejection.rejectionComment,
      ]
        .filter(Boolean)
        .join(". "),
    );

    return { decision };
  }

  if (decision === "HOLD") {
    await prisma.application.update({
      where: { id: applicationId },
      data: { ...base, outcome: "ON_HOLD" },
    });

    await tellAgency(`Клиент взял паузу по кандидату ${name}`);
    return { decision };
  }

  // INTERVIEW и OFFER двигают кандидата по воронке
  const targetCode = decision === "INTERVIEW" ? "CLIENT_INTERVIEW" : "OFFER";
  const targetStage = await prisma.pipelineStage.findFirst({
    where: { vacancyId: application.vacancyId, code: targetCode },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: {
        ...base,
        outcome: "IN_PROGRESS",
        ...(targetStage && {
          stageId: targetStage.id,
          stageEnteredAt: now,
        }),
      },
    }),
    prisma.stageTransition.create({
      data: {
        applicationId,
        fromStageId: application.stageId,
        toStageId: targetStage?.id ?? application.stageId,
        fromOutcome: application.outcome,
        toOutcome: "IN_PROGRESS",
        comment:
          decision === "INTERVIEW"
            ? "Клиент пригласил на интервью"
            : "Клиент готов сделать оффер",
        hoursInPreviousStage:
          (now.getTime() - application.stageEnteredAt.getTime()) / 3_600_000,
        actorId: actor.id,
      },
    }),
  ]);

  // BR-13: приглашение на интервью сразу заводит встречу в состоянии
  // «нужно предложить слоты» — рекрутер увидит её как задачу
  if (decision === "INTERVIEW") {
    const existing = await prisma.interview.findFirst({
      where: {
        applicationId,
        status: { in: ["SLOTS_REQUESTED", "SLOTS_PROPOSED", "CONFIRMED"] },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.interview.create({
        data: {
          organizationId: actor.organizationId,
          applicationId,
          vacancyId: application.vacancyId,
          type: "CLIENT",
          status: "SLOTS_REQUESTED",
          createdById: actor.id,
        },
      });

      // Задача рекрутера: подобрать и прислать времена
      await notify({
        organizationId: actor.organizationId,
        userIds: await agencySideRecipients(application.vacancyId, actor.id),
        event: "INTERVIEW_SLOTS_REQUESTED",
        title: `Нужно предложить время: ${name}`,
        body: "Клиент готов встретиться — подберите два-пять вариантов.",
        linkUrl: link.application(applicationId),
      });
    }
  } else {
    await tellAgency(`Клиент готов делать оффер: ${name}`);
  }

  return { decision };
}

/**
 * Отмена отказа клиента (BR-12 в обратную сторону).
 *
 * Нажали «Отказать» по ошибке — раньше единственный путь назад был
 * попросить рекрутера поправить вручную в базе. Возвращает заявку туда
 * же, где она была: этап отказ не менял, значит и отмена его не двигает.
 * Причина отказа стирается — вернувшись в работу, кандидат снова «просто
 * в процессе», а не «отказан, но передумали» с историческим шлейфом,
 * который потом сбивает статистику по причинам отказа (BR-11).
 */
export async function undoClientRejection(actor: Actor, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      outcome: true,
      stageId: true,
      vacancyId: true,
      candidate: { select: { fullName: true } },
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  if (application.outcome !== "REJECTED" && application.outcome !== "WITHDRAWN") {
    throw new ApplicationError("Отказа по этому кандидату нет");
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      outcome: "IN_PROGRESS",
      clientDecision: null,
      clientDecisionAt: null,
      clientDecisionById: null,
      submittedOnBehalfById: null,
      rejectionReason: null,
      rejectionComment: null,
      rejectedBy: null,
    },
  });

  await prisma.stageTransition.create({
    data: {
      applicationId,
      fromStageId: application.stageId,
      toStageId: application.stageId,
      fromOutcome: application.outcome,
      toOutcome: "IN_PROGRESS",
      comment: "Отказ отменён клиентом",
      actorId: actor.id,
    },
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: await agencySideRecipients(application.vacancyId, actor.id),
    event: "CLIENT_DECISION_MADE",
    title: `Отказ отменён: ${application.candidate.fullName}`,
    body: "Клиент передумал — кандидат снова в работе.",
    linkUrl: link.application(applicationId),
  });
}

/**
 * Записать условия оффера.
 *
 * Отдельная операция, потому что сумму оффера знает только агентство:
 * клиент решает «делаем предложение» (setClientDecision OFFER), а о чём
 * договорились с кандидатом, вносит рекрутер. Без суммы найм не пройдёт —
 * см. moveStage.
 *
 * Дату первой отправки не переписываем при повторном сохранении: торг
 * по офферу обычное дело, а «когда впервые предложили» нужно для сроков.
 */
export async function recordOffer(
  actor: Actor,
  applicationId: string,
  // Форма присылает все поля (OfferInput), сервис — и тесты, и будущие
  // вызовы — вправе передать только сумму
  input: Pick<OfferInput, "salary"> & Partial<Omit<OfferInput, "salary">>,
) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      offerSentAt: true,
      candidate: { select: { erasureState: true } },
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  // Оффер — тоже обработка данных кандидата: после блокировки (ст. 21
  // 152-ФЗ) его не вносят, как и не двигают карточку
  if (erasureBlocksProcessing(application.candidate.erasureState)) {
    throw new ApplicationError(
      erasureBlockMessage(application.candidate.erasureState),
    );
  }

  await prisma.application.update({
    where: { id: application.id },
    data: {
      offerSalary: input.salary,
      offerPosition: input.position ?? null,
      offerStartDate: input.startDate ?? null,
      offerSentAt: application.offerSentAt ?? new Date(),
    },
  });
}

/**
 * Записать гарантийный случай (BR-10): нанятый ушёл в гарантийный срок.
 *
 * Клиенту обещано: если человек уходит в оговорённый срок, агентство ищет
 * замену. До этой функции записать такой уход было негде, и замену
 * выставили бы в счёт как новый найм.
 *
 * Исход остаётся HIRED: найм состоялся и оплачен, случай — отдельный факт
 * поверх него. Замену отмечает уже moveStage при следующем найме
 * по этой же вакансии (replacementForId) — её в счёт не включают.
 *
 * Возвращает вакансию, чтобы действие могло сразу вернуть её в работу.
 */
export async function recordGuaranteeCase(
  actor: Actor,
  applicationId: string,
  input: Pick<GuaranteeCaseInput, "leftAt" | "reason"> &
    Partial<Pick<GuaranteeCaseInput, "comment">>,
): Promise<{ vacancyId: string }> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: actor.organizationId },
    select: {
      id: true,
      vacancyId: true,
      outcome: true,
      hiredAt: true,
      guaranteeUntil: true,
      guaranteeBrokenAt: true,
    },
  });
  if (!application) throw new ApplicationError("Кандидат не найден");

  if (application.outcome !== "HIRED" || !application.hiredAt) {
    throw new ApplicationError(
      "Гарантийный случай бывает только у нанятого кандидата",
    );
  }
  if (application.guaranteeBrokenAt) {
    throw new ApplicationError("Гарантийный случай по этому найму уже записан");
  }
  if (!application.guaranteeUntil) {
    throw new ApplicationError(
      "У этого найма нет гарантии: при найме у клиента не было действующего договора",
    );
  }

  // Сравниваем по дням: «ушёл в последний день гарантии» — гарантийный
  // случай, а время суток в дате ухода никто не указывает
  const dayEnd = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  if (input.leftAt.getTime() > dayEnd(application.guaranteeUntil).getTime()) {
    throw new ApplicationError(
      `Гарантия закончилась ${application.guaranteeUntil.toLocaleDateString("ru-RU")} — ` +
        "уход после неё не гарантийный случай, замена по договору не положена.",
    );
  }
  if (input.leftAt.getTime() < new Date(application.hiredAt).setHours(0, 0, 0, 0)) {
    throw new ApplicationError("Дата ухода раньше даты найма — проверьте дату");
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { id: application.id },
      data: {
        guaranteeBrokenAt: input.leftAt,
        guaranteeBreakReason: input.reason,
        guaranteeBreakComment: input.comment ?? null,
      },
    }),
    prisma.activityLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        entityType: "Application",
        entityId: application.id,
        action: "guarantee_case",
        diff: {
          ушёл: input.leftAt.toISOString(),
          причина: input.reason,
        },
      },
    }),
  ]);

  return { vacancyId: application.vacancyId };
}

/** Отметка о полученном согласии на обработку ПДн (BR-33). */
export async function markConsentGiven(actor: Actor, candidateId: string) {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!candidate) throw new ApplicationError("Кандидат не найден");

  const now = new Date();
  const expires = new Date(now);
  // Срок действия согласия — год (BR-34), дальше данные подлежат
  // удалению или обезличиванию
  expires.setFullYear(expires.getFullYear() + 1);

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      consentStatus: "GIVEN",
      consentGivenAt: now,
      consentExpiresAt: expires,
    },
  });

  // Продление вручную снимает блокировку по истёкшему сроку так же, как
  // продление по ссылке: иначе кандидат с действующим согласием остался
  // бы заблокированным, а через тридцать дней очередь уничтожила бы его
  // данные. Отзыв этим не отменяется — см. liftExpiredConsentBlock
  await liftExpiredConsentBlock(candidateId);
}

/**
 * Воронка вакансии.
 *
 * Единственный источник данных для канбана — и для агентства,
 * и для клиента. Разницу делает visibleApplicationsFilter (BR-3),
 * а не отдельные запросы в разных экранах.
 */
export async function listPipeline(actor: Actor, vacancyId: string) {
  const rows = await prisma.application.findMany({
    where: { vacancyId, ...visibleApplicationsFilter(actor) },
    orderBy: [{ priority: "desc" }, { stageEnteredAt: "asc" }],
    select: {
      id: true,
      stageId: true,
      stageEnteredAt: true,
      outcome: true,
      presentedAt: true,
      presentationSummary: true,
      rejectionReason: true,
      rejectedBy: true,
      clientDecision: true,
      candidate: {
        select: {
          id: true,
          fullName: true,
          currentPosition: true,
          currentCompany: true,
          city: true,
          salaryExpectation: true,
          consentStatus: true,
        },
      },
      _count: { select: { comments: true } },
    },
  });

  // Prisma отдаёт Decimal объектом, а доска — клиентский компонент:
  // непростые объекты через границу сервер-клиент не проходят.
  // Приводим здесь, чтобы каждый экран не делал это сам.
  return rows.map((row) => ({
    ...row,
    candidate: {
      ...row.candidate,
      salaryExpectation:
        row.candidate.salaryExpectation === null
          ? null
          : Number(row.candidate.salaryExpectation),
    },
  }));
}

/**
 * Все кандидаты, доступные актору, поперёк вакансий.
 *
 * Воронка отвечает на вопрос «что с этой вакансией», а этот список —
 * на вопрос «кто у меня сейчас в работе вообще». У клиента с пятью
 * вакансиями второе спрашивается чаще: решения ждут люди, а не вакансии.
 *
 * Порог видимости тот же (BR-3): в выборку идёт только то, что клиенту
 * уже показали. Отдельного правила здесь нет и быть не должно.
 */
export async function listApplications(
  actor: Actor,
  filters: {
    vacancyId?: string;
    awaitingDecision?: boolean;
    /**
     * Поиск по имени, должности или компании (BR-22 — фильтрация на сервере).
     *
     * Слова через пробел ищутся через И, а не через ИЛИ: должность
     * свободным текстом не впихнуть в выпадающий список, а «Иван Иванов»
     * с типовым именем в базе не один. «иван иванов директор» находит
     * только того, у кого директор совпадает — без этого набора слов
     * пришлось бы листать всех Иванов Ивановых руками.
     */
    query?: string;
    salaryFrom?: number;
    salaryTo?: number;
    /** Не заданы — отдаём всё (дашборду хватает малого «ждут решения»-подмножества). */
    take?: number;
    skip?: number;
  } = {},
) {
  const terms = filters.query?.trim().split(/\s+/).filter(Boolean) ?? [];

  const rows = await prisma.application.findMany({
    where: {
      ...visibleApplicationsFilter(actor),
      ...(filters.vacancyId && { vacancyId: filters.vacancyId }),
      // Ждут решения: показаны клиенту, но реакции ещё не было
      ...(filters.awaitingDecision && {
        presentedAt: { not: null },
        clientDecision: null,
        outcome: "IN_PROGRESS",
      }),
      ...((terms.length > 0 || filters.salaryFrom || filters.salaryTo) && {
        AND: [
          ...terms.map((term) => ({
            candidate: {
              OR: [
                { fullName: { contains: term, mode: "insensitive" as const } },
                { currentPosition: { contains: term, mode: "insensitive" as const } },
                { currentCompany: { contains: term, mode: "insensitive" as const } },
              ],
            },
          })),
          ...(filters.salaryFrom || filters.salaryTo
            ? [
                {
                  candidate: {
                    salaryExpectation: {
                      ...(filters.salaryFrom && { gte: filters.salaryFrom }),
                      ...(filters.salaryTo && { lte: filters.salaryTo }),
                    },
                  },
                },
              ]
            : []),
        ],
      }),
    },
    // Сначала те, кто дольше всех ждёт ответа: это и есть очередь работы
    orderBy: [{ presentedAt: "asc" }, { stageEnteredAt: "asc" }],
    // На одну карточку больше запрошенного — по ней узнаём, что дальше
    // есть ещё, без отдельного count-запроса (BR-22)
    ...(filters.take && { take: filters.take + 1 }),
    ...(filters.skip && { skip: filters.skip }),
    select: {
      id: true,
      outcome: true,
      presentedAt: true,
      clientDecision: true,
      clientDecisionAt: true,
      stageEnteredAt: true,
      stage: { select: { name: true, code: true, order: true } },
      vacancy: {
        select: {
          id: true,
          number: true,
          title: true,
          // Только для агентского сквозного списка (клиент про своего
          // клиента и так знает) — лишний select дешевле отдельного запроса
          client: { select: { id: true, name: true } },
        },
      },
      candidate: {
        select: {
          id: true,
          fullName: true,
          currentPosition: true,
          currentCompany: true,
          city: true,
          salaryExpectation: true,
        },
      },
      _count: { select: { comments: true } },
    },
  });

  const hasMore = Boolean(filters.take && rows.length > filters.take);
  const page = hasMore ? rows.slice(0, filters.take) : rows;

  return { items: plain(page), hasMore };
}

/** Карточка кандидата в воронке. null → 404 (BR-28). */
export async function getApplication(actor: Actor, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, ...visibleApplicationsFilter(actor) },
    include: {
      candidate: true,
      stage: true,
      vacancy: {
        select: {
          id: true,
          number: true,
          title: true,
          clientId: true,
          hiringManagerId: true,
          client: { select: { name: true } },
          stages: { orderBy: { order: "asc" } },
        },
      },
      transitions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStageId: true,
          toStageId: true,
          toOutcome: true,
          comment: true,
          actorId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!application) return null;

  // Доступ к ПДн логируется независимо от того, кто смотрит (BR-36)
  await prisma.personalDataAccessLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      candidateId: application.candidateId,
      action: "view",
    },
  });

  const attachments = await prisma.attachment.findMany({
    where: {
      deletedAt: null,
      ...visibleAttachmentsFilter(actor),
      OR: [
        { candidateId: application.candidateId },
        { applicationId: application.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Контакты кандидата и внутреннее саммари рекрутера клиенту
  // не отдаём вовсе, а не просто не рисуем: данные страницы уходят
  // в браузер целиком. Контакт кандидата — это и есть товар агентства
  const candidate = stripInternal(actor, application.candidate, [
    "summary",
    "phone",
    "email",
    "telegram",
    "consentToken",
    "consentDocUrl",
  ]);

  // Зарплатные ожидания и стаж — Decimal, а карточку рисуют клиентские
  // компоненты: панель решения, тред, загрузка резюме
  return plain({ ...application, candidate, attachments });
}
