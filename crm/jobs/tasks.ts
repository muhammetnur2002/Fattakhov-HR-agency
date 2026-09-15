import { prisma } from "@/lib/db/prisma";
import { notify, flushCollapsed } from "@/lib/notifications/notify";
import { agencySideRecipients } from "@/lib/notifications/recipients";
import { link } from "@/lib/notifications/links";
import { formatMoney } from "@/lib/pricing";
import { overdueInvoiceFilter } from "@/lib/services/invoice-status";
import { expireConsents } from "@/lib/services/pdn-retention";
import { businessHoursBetween } from "@/lib/services/sla";
import { sendWeeklyDigest } from "./digest";

/**
 * Фоновые задачи.
 *
 * Каждая — идемпотентна: повторный запуск ничего не дублирует, потому
 * что факт отправки записан флагом в самой сущности. Это важнее
 * надёжной очереди: планировщик можно перезапускать сколько угодно,
 * а кандидат не получит два одинаковых напоминания.
 */

/** Напоминание за сутки (BR-17). */
export async function sendReminders24h(): Promise<number> {
  const from = new Date(Date.now() + 23 * 3_600_000);
  const to = new Date(Date.now() + 25 * 3_600_000);

  const interviews = await prisma.interview.findMany({
    where: {
      status: "CONFIRMED",
      scheduledAt: { gte: from, lte: to },
      reminder24hSentAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      scheduledAt: true,
      timezone: true,
      participantUserIds: true,
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });

  for (const interview of interviews) {
    await notify({
      organizationId: interview.organizationId,
      userIds: interview.participantUserIds,
      event: "INTERVIEW_REMINDER_24H",
      title: `Завтра интервью: ${interview.application.candidate.fullName}`,
      body: formatWhen(interview.scheduledAt!, interview.timezone),
      linkUrl: link.application(interview.applicationId),
    });

    // Флаг ставим после отправки: упавший процесс приведёт к повтору,
    // а не к молчанию — это менее болезненная ошибка
    await prisma.interview.update({
      where: { id: interview.id },
      data: { reminder24hSentAt: new Date() },
    });
  }

  return interviews.length;
}

/** Напоминание за час (BR-17). */
export async function sendReminders1h(): Promise<number> {
  const from = new Date(Date.now() + 30 * 60_000);
  const to = new Date(Date.now() + 90 * 60_000);

  const interviews = await prisma.interview.findMany({
    where: {
      status: "CONFIRMED",
      scheduledAt: { gte: from, lte: to },
      reminder1hSentAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      scheduledAt: true,
      timezone: true,
      meetingUrl: true,
      participantUserIds: true,
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });

  for (const interview of interviews) {
    await notify({
      organizationId: interview.organizationId,
      userIds: interview.participantUserIds,
      event: "INTERVIEW_REMINDER_1H",
      title: `Через час интервью: ${interview.application.candidate.fullName}`,
      body: interview.meetingUrl ?? undefined,
      linkUrl: link.application(interview.applicationId),
    });

    await prisma.interview.update({
      where: { id: interview.id },
      data: { reminder1hSentAt: new Date() },
    });
  }

  return interviews.length;
}

/**
 * Авто-завершение встречи и запрос обратной связи (BR-18).
 *
 * Через два часа после начала встреча считается проведённой. Просить
 * обратную связь раньше бессмысленно, позже — человек уже забыл детали.
 */
export async function completePastInterviews(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 3_600_000);

  const interviews = await prisma.interview.findMany({
    where: { status: "CONFIRMED", scheduledAt: { lt: cutoff } },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      participantUserIds: true,
      application: { select: { candidate: { select: { fullName: true } } } },
    },
  });

  for (const interview of interviews) {
    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: "COMPLETED" },
    });

    await notify({
      organizationId: interview.organizationId,
      userIds: interview.participantUserIds,
      event: "INTERVIEW_FEEDBACK_REQUEST",
      title: `Как прошло интервью с ${interview.application.candidate.fullName}?`,
      body: "Пара слов и оценка помогут скорректировать поиск.",
      linkUrl: link.application(interview.applicationId),
    });
  }

  return interviews.length;
}

/**
 * Просрочки решений на стороне клиента (BR-9).
 *
 * Считаем в рабочих часах: кандидат, представленный в пятницу вечером,
 * не должен числиться просроченным утром в понедельник.
 *
 * Напоминаем агентству, а не клиенту: это аргумент в разговоре о сроках
 * и защита рекрутера, который иначе выглядит медленным.
 */
export async function checkOverdueDecisions(): Promise<number> {
  const applications = await prisma.application.findMany({
    where: {
      presentedAt: { not: null },
      clientDecision: null,
      outcome: "IN_PROGRESS",
    },
    select: {
      id: true,
      organizationId: true,
      vacancyId: true,
      presentedAt: true,
      stage: { select: { slaHours: true } },
      candidate: { select: { fullName: true } },
    },
  });

  let overdue = 0;

  for (const application of applications) {
    const limit = application.stage.slaHours;
    if (!limit || !application.presentedAt) continue;

    const waited = businessHoursBetween(application.presentedAt, new Date());
    if (waited < limit) continue;

    await notify({
      organizationId: application.organizationId,
      userIds: await agencySideRecipients(application.vacancyId),
      event: "CLIENT_DECISION_OVERDUE",
      title: `Клиент не отвечает: ${application.candidate.fullName}`,
      body: `Ждём решения больше ${Math.round(waited)} рабочих часов.`,
      linkUrl: link.application(application.id),
      // Одно напоминание в сутки на вакансию, а не по кандидату
      groupKey: `overdue:${application.vacancyId}:${new Date().toDateString()}`,
    });

    overdue++;
  }

  return overdue;
}

/**
 * Просроченные счета.
 *
 * Уведомляем обе стороны: клиенту напоминание, аккаунт-менеджеру
 * сигнал, что пора звонить. Счёт, о котором забыли обе стороны, —
 * это деньги, которые агентство не получит.
 */
export async function markOverdueInvoices(): Promise<number> {
  const overdue = await prisma.invoice.findMany({
    // Что считать просрочкой — правило счёта, а не расписания задач:
    // держим его рядом с isOverdue, чтобы две записи одного правила
    // не разъехались
    where: overdueInvoiceFilter(),
    select: {
      id: true,
      number: true,
      amount: true,
      organizationId: true,
      clientId: true,
      client: { select: { name: true, accountManagerId: true } },
    },
  });

  for (const invoice of overdue) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "OVERDUE" },
    });

    const clientUsers = await prisma.user.findMany({
      where: {
        clientId: invoice.clientId,
        role: "CLIENT_ADMIN",
        isActive: true,
      },
      select: { id: true },
    });

    const recipients = [
      ...clientUsers.map((u) => u.id),
      ...(invoice.client.accountManagerId
        ? [invoice.client.accountManagerId]
        : []),
    ];

    await notify({
      organizationId: invoice.organizationId,
      userIds: recipients,
      event: "INVOICE_OVERDUE",
      title: `Счёт №${invoice.number} просрочен`,
      body: `${invoice.client.name}, ${formatMoney(Number(invoice.amount))}.`,
      linkUrl: link.invoices(),
    });
  }

  return overdue.length;
}

/** Полный проход планировщика. */
export async function runScheduledTasks(): Promise<Record<string, number>> {
  return {
    напоминанийЗаСутки: await sendReminders24h(),
    напоминанийЗаЧас: await sendReminders1h(),
    завершеноВстреч: await completePastInterviews(),
    просрочекРешений: await checkOverdueDecisions(),
    просроченныхСчетов: await markOverdueInvoices(),
    истёкшихСогласий: await expireConsents(),
    сводокОтправлено: await flushCollapsed(),
    еженедельныхДайджестов: await sendWeeklyDigest(),
  };
}

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
