/**
 * Воронка клиентов студенческой платформы: где человек остановился на пути
 * от регистрации до договора с агентством. Этап считается по тому, что он
 * успел сделать на платформе, — менеджер видит, кому уже пора звонить.
 */

export interface FunnelActivity {
  vacancies: number;
  published: number;
  applications: number;
  newApplications: number;
  invited: number;
  hired: number;
  lastActivityAt: string | null;
  registeredAt: string;
}

export const FUNNEL_STAGES = ["REGISTERED", "VACANCY", "APPLICATIONS", "READY", "CONTRACT"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  REGISTERED: "Зарегистрировался",
  VACANCY: "Есть вакансия",
  APPLICATIONS: "Получает отклики",
  READY: "Пора предложить подбор",
  CONTRACT: "Договор",
};

export const FUNNEL_STAGE_HINTS: Record<FunnelStage, string> = {
  REGISTERED: "Кабинет есть, вакансий ещё нет",
  VACANCY: "Вакансия заведена, откликов пока нет",
  APPLICATIONS: "Студенты откликаются, идёт переписка",
  READY: "Пять и больше откликов, приглашения или найм — самое время позвонить",
  CONTRACT: "Действующий клиент агентства",
};

/** Отклики, после которых работодателю уже интересно, чтобы за него искали. */
const READY_APPLICATIONS = 5;
/** Дней без движения, после которых клиент считается остывшим. */
export const COLD_AFTER_DAYS = 14;

export function funnelStage(clientActive: boolean, activity: FunnelActivity | null): FunnelStage {
  if (clientActive) return "CONTRACT";
  if (!activity) return "REGISTERED";
  if (activity.hired > 0 || activity.invited > 0 || activity.applications >= READY_APPLICATIONS) return "READY";
  if (activity.applications > 0) return "APPLICATIONS";
  if (activity.vacancies > 0) return "VACANCY";
  return "REGISTERED";
}

/** Последнее движение: отклик, ответ или шаг по отклику; если ничего не было — регистрация. */
export function lastMove(activity: FunnelActivity): Date {
  return new Date(activity.lastActivityAt ?? activity.registeredAt);
}

export function isCold(activity: FunnelActivity, now: Date = new Date()): boolean {
  const days = (now.getTime() - lastMove(activity).getTime()) / 86_400_000;
  return days >= COLD_AFTER_DAYS;
}
