import { assertCanDo, type Actor } from "@/lib/access";
import { notify } from "@/lib/notifications/notify";
import { link } from "@/lib/notifications/links";
import { clientSideRecipients } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/db/prisma";
import type { VacancyBriefInput } from "@/lib/validation/vacancy";

/**
 * Правка брифа вакансии сотрудником агентства.
 *
 * Бриф клиент правит сам, пока заявка не ушла в работу (BR-21). Агентству
 * нужна своя правка: клиент продиктовал уточнение по телефону, рекрутёр
 * поправил требования после разговора. Автосохранение мастера для этого не
 * годится: оно рассчитано на черновик и не умеет очищать поля (пустое поле
 * там означает «не менять»). Здесь пустое поле стирает значение.
 *
 * Каждая правка пишется в журнал действий (кто, когда, какие поля), а клиент
 * получает уведомление, если заявка уже у него на виду.
 */

export class VacancyBriefError extends Error {}

/** Поля брифа, которые умеет править эта форма, и их названия для людей. */
export const BRIEF_FIELD_LABELS = {
  title: "Название",
  department: "Подразделение",
  hiringManagerId: "Заказчик",
  headcount: "Сколько человек",
  reasonForHire: "Причина найма",
  urgency: "Срочность",
  desiredStartDate: "Желаемая дата выхода",
  responsibilities: "Обязанности",
  requirements: "Требования",
  niceToHave: "Будет плюсом",
  stopFactors: "Стоп-факторы",
  targetCompanies: "Целевые компании",
  salaryFrom: "Зарплата от",
  salaryTo: "Зарплата до",
  salaryGross: "Зарплата до вычета налога",
  bonusScheme: "Бонусы",
  city: "Город",
  workFormat: "Формат работы",
  employmentType: "Тип занятости",
  workSchedule: "График",
  conditions: "Условия",
  interviewStages: "Этапы интервью",
} as const;

type BriefField = keyof typeof BRIEF_FIELD_LABELS;
const FIELDS = Object.keys(BRIEF_FIELD_LABELS) as BriefField[];

/** Статусы, в которых клиент уже видит заявку и стоит сообщить об изменении. */
const NOTIFY_STATUSES = ["SUBMITTED", "CLARIFYING", "ESTIMATED", "ACTIVE", "ON_HOLD"];

/** Значение для сравнения до и после: даты и десятичные числа приводятся к строке. */
function comparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Значения формы → поля модели: пустое стирает, а не «не меняет». */
function toColumns(input: VacancyBriefInput) {
  return {
    title: input.title,
    department: input.department ?? null,
    hiringManagerId: input.hiringManagerId ?? null,
    headcount: input.headcount,
    reasonForHire: input.reasonForHire ?? null,
    urgency: input.urgency,
    desiredStartDate: input.desiredStartDate ?? null,
    responsibilities: input.responsibilities ?? null,
    requirements: input.requirements ?? null,
    niceToHave: input.niceToHave ?? null,
    stopFactors: input.stopFactors ?? null,
    targetCompanies: input.targetCompanies ?? null,
    salaryFrom: input.salaryFrom ?? null,
    salaryTo: input.salaryTo ?? null,
    salaryGross: input.salaryGross,
    bonusScheme: input.bonusScheme ?? null,
    city: input.city ?? null,
    workFormat: input.workFormat ?? null,
    employmentType: input.employmentType ?? null,
    workSchedule: input.workSchedule ?? null,
    conditions: input.conditions ?? null,
    interviewStages: input.interviewStages ?? null,
  };
}

/** Что именно поменялось: названия полей по-русски, зарплатная вилка одним пунктом. */
export function describeChangedFields(changed: BriefField[]): string[] {
  const labels: string[] = [];
  for (const field of changed) {
    const label =
      field === "salaryFrom" || field === "salaryTo" ? "Зарплатная вилка" : BRIEF_FIELD_LABELS[field];
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

export async function editBriefAsAgency(
  actor: Actor,
  vacancyId: string,
  input: VacancyBriefInput,
): Promise<{ changed: BriefField[] }> {
  assertCanDo(actor, "vacancy.editBrief");
  if (actor.clientId) throw new VacancyBriefError("Правка брифа за клиента доступна только агентству");

  const before = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: { clientId: true, status: true, number: true, ...selectFields() },
  });
  if (!before) throw new VacancyBriefError("Вакансия не найдена");
  if (before.status.startsWith("CLOSED_")) {
    throw new VacancyBriefError("Закрытую вакансию править нельзя");
  }

  // Заказчик обязан быть человеком этого клиента: иначе чужой пользователь
  // получил бы доступ к вакансии через подставленный в форму идентификатор
  if (input.hiringManagerId) {
    const manager = await prisma.user.findFirst({
      where: {
        id: input.hiringManagerId,
        clientId: before.clientId,
        isActive: true,
        role: { in: ["CLIENT_HIRING", "CLIENT_ADMIN"] },
      },
      select: { id: true },
    });
    if (!manager) throw new VacancyBriefError("Заказчик должен быть сотрудником этого клиента");
  }

  const next = toColumns(input);
  const changed = FIELDS.filter(
    (field) => comparable((before as Record<string, unknown>)[field]) !== comparable(next[field]),
  );
  if (changed.length === 0) return { changed };

  await prisma.vacancy.update({ where: { id: vacancyId }, data: next });
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Vacancy",
      entityId: vacancyId,
      action: "brief_edited",
      diff: { fields: changed },
    },
  });

  if (NOTIFY_STATUSES.includes(before.status)) {
    await notify({
      organizationId: actor.organizationId,
      userIds: await clientSideRecipients(vacancyId, actor.id),
      event: "VACANCY_BRIEF_CHANGED",
      title: `Изменён бриф: №${before.number} ${next.title}`,
      body: `Агентство внесло изменения: ${describeChangedFields(changed).join(", ").toLowerCase()}.`,
      linkUrl: link.vacancy(vacancyId),
      groupKey: vacancyId,
    });
  }

  return { changed };
}

function selectFields() {
  return Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<BriefField, true>;
}

/** Последняя правка брифа сотрудником агентства: кто и когда. */
export async function lastBriefEdit(vacancyId: string) {
  const entry = await prisma.activityLog.findFirst({
    where: { entityType: "Vacancy", entityId: vacancyId, action: "brief_edited" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actor: { select: { fullName: true } } },
  });
  return entry ? { at: entry.createdAt, by: entry.actor?.fullName ?? null } : null;
}
