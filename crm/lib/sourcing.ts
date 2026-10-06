/**
 * Правила сорсинг-лида без обращения к базе: срок, список полей, расчёт
 * дней. Отдельно от lib/services/sourcing.ts, чтобы их могли брать
 * клиентские компоненты (форма добавления, карточка) — сервис тянет
 * за собой Prisma, которой в браузере не место. Смысл режима и его
 * пункты — в шапке lib/services/sourcing.ts.
 */

/** Сколько живёт сорсинг-лид без согласия. */
export const SOURCING_LEAD_TTL_DAYS = 14;

/** За сколько дней до срока напомнить тому, кто завёл кандидата. */
export const SOURCING_REMINDER_DAYS_BEFORE = 3;

const DAY = 86_400_000;

/**
 * Поля, которые до согласия заполнять нельзя.
 *
 * Список, а не «разрешено всё, кроме»: новое поле в модели по умолчанию
 * должно оказаться запрещённым, а не разрешённым. Забыть дописать сюда
 * безопаснее, чем забыть убрать из белого списка.
 */
export const SOURCING_RESTRICTED_FIELDS = [
  "city",
  "birthYear",
  "currentPosition",
  "currentCompany",
  "totalExperienceYears",
  "education",
  "summary",
  "skills",
  "languages",
  "salaryExpectation",
] as const;

export type SourcingRestrictedField = (typeof SOURCING_RESTRICTED_FIELDS)[number];

/** Человеческие названия — для сообщения рекрутеру. */
const FIELD_LABELS: Record<SourcingRestrictedField, string> = {
  city: "город",
  birthYear: "год рождения",
  currentPosition: "должность",
  currentCompany: "компания",
  totalExperienceYears: "опыт",
  education: "образование",
  summary: "заметки",
  skills: "навыки",
  languages: "языки",
  salaryExpectation: "зарплатные ожидания",
};

export const SOURCING_FILES_MESSAGE =
  "Пока кандидат не дал согласие, файлы не сохраняются: в резюме всё то, " +
  "что до согласия хранить нельзя. Получите согласие — загрузка откроется.";

/**
 * Что из переданного запрещено до согласия.
 *
 * Пустые значения не считаются заполнением: форма присылает все поля
 * сразу, и пустая строка в «городе» это не попытка записать город,
 * а нетронутое поле.
 */
export function restrictedFieldsIn(input: Record<string, unknown>): string[] {
  return SOURCING_RESTRICTED_FIELDS.filter((field) => {
    const value = input[field];
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }).map((field) => FIELD_LABELS[field]);
}

/** Сорсинг-лид ли это прямо сейчас: заведён без согласия, и согласия ещё не было. */
export function isSourcingLead(candidate: {
  sourcedAt: Date | string | null;
  consentStatus: string;
}): boolean {
  return candidate.sourcedAt !== null && candidate.consentStatus === "PENDING";
}

/** Срок, к которому согласие должно быть получено. */
export function sourcingDeadline(sourcedAt: Date): Date {
  return new Date(sourcedAt.getTime() + SOURCING_LEAD_TTL_DAYS * DAY);
}

/** Сколько дней осталось. Ноль и меньше — срок вышел. */
export function sourcingDaysLeft(sourcedAt: Date, now: Date = new Date()): number {
  return Math.ceil((sourcingDeadline(sourcedAt).getTime() - now.getTime()) / DAY);
}
