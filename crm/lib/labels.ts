/**
 * Человекочитаемые названия для значений enum'ов.
 *
 * Единая точка (ТЗ 2.2): мультиязычности в v1 нет, но строки собраны здесь,
 * чтобы перевод не превратился в раскопки по компонентам. Правило: ни одной
 * подписи к enum-значению прямо в JSX.
 */
import type {
  ApplicationOutcome,
  CandidateSource,
  ClientDecision,
  ClientStatus,
  EmploymentType,
  InterviewFormat,
  InterviewStatus,
  InterviewType,
  RejectionReason,
  RejectionSide,
  UserRole,
  VacancyStatus,
  VacancyUrgency,
  WorkFormat,
} from "@/lib/generated/prisma/enums";
import type { StaffGrant } from "@/lib/access";

/**
 * Значение фильтра «ведущий не назначен» в адресе (`?recruiterId=none`).
 *
 * Живёт здесь, а не в сервисе вакансий: константу читает и клиентский
 * фильтр, а импорт сервиса в клиентский компонент затащил бы в браузер
 * весь слой данных.
 */
export const UNASSIGNED_RECRUITER = "none";

/**
 * Доступы сверх роли. Подпись и пояснение — в форме «Сотрудники»
 * и на странице студенческой платформы.
 */
export const STAFF_GRANT_LABELS: Record<StaffGrant, { label: string; hint: string }> = {
  "staff.manage": {
    label: "Управлять сотрудниками",
    hint: "Приглашать, менять должность и доступы, отключать — не выше своей роли и только теми доступами, что есть у самого.",
  },
  "students.moderation": {
    label: "Студенческая платформа: компании и вакансии",
    hint: "Проверка компаний и вакансий перед публикацией, выгрузка из CRM.",
  },
  "students.study": {
    label: "Студенческая платформа: студенты и справки",
    hint: "Подтверждение учёбы по справке, статусы студентов, рассылка напоминаний.",
  },
  "students.pilot": {
    label: "Студенческая платформа: метрики пилота",
    hint: "Воронка, время до первой возможности и журнал событий.",
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Владелец",
  HEAD: "Руководитель подбора",
  RECRUITER: "Рекрутер",
  ACCOUNT: "Аккаунт-менеджер",
  CLIENT_ADMIN: "Администратор",
  CLIENT_HIRING: "Нанимающий менеджер",
  CLIENT_VIEWER: "Наблюдатель",
};

export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  DRAFT: "Черновик",
  SUBMITTED: "Заявка отправлена",
  CLARIFYING: "Уточняем детали",
  ESTIMATED: "Ждём подтверждения",
  ACTIVE: "В работе",
  ON_HOLD: "Приостановлена",
  CLOSED_SUCCESS: "Закрыта наймом",
  CLOSED_CANCELLED: "Отменена",
  CLOSED_FAILED: "Закрыта без найма",
};

export const APPLICATION_OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  IN_PROGRESS: "В работе",
  HIRED: "Вышел на работу",
  REJECTED: "Отказ",
  WITHDRAWN: "Кандидат отказался",
  ON_HOLD: "Пауза",
};

/** Что произошло после решения клиента — короткое сообщение и его же переиспользуем на карточке после отказа/паузы/приглашения. */
export const CLIENT_DECISION_MESSAGES: Record<ClientDecision, string> = {
  INTERVIEW: "Рекрутер подберёт время и пришлёт слоты",
  HOLD: "Кандидат отправлен в резерв",
  REJECT: "Отказ зафиксирован",
  OFFER: "Отмечено: готовы делать оффер",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  LEAD: "Лид",
  ACTIVE: "Активный",
  PAUSED: "На паузе",
  ARCHIVED: "В архиве",
};

export const URGENCY_LABELS: Record<VacancyUrgency, string> = {
  LOW: "Не горит",
  NORMAL: "Обычная",
  HIGH: "Высокая",
  CRITICAL: "Критическая",
};

export const WORK_FORMAT_LABELS: Record<WorkFormat, string> = {
  OFFICE: "В офисе",
  REMOTE: "Удалённо",
  HYBRID: "Гибрид",
};

/**
 * Причины отказа (ТЗ 5.2).
 *
 * Разделены по стороне: сверху то, что говорит клиент, снизу — кандидат.
 * Смешивать нельзя, из этого потом собираются два разных отчёта.
 */
export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  // от клиента
  EXPERIENCE_MISMATCH: "Не тот опыт",
  SKILLS_MISMATCH: "Не хватает навыков",
  SALARY_TOO_HIGH: "Слишком дорогой",
  CULTURE_FIT: "Не подходит по культуре",
  OVERQUALIFIED: "Слишком высокая квалификация",
  LOCATION: "Не подходит локация",
  FAILED_INTERVIEW: "Не прошёл интервью",
  FAILED_TEST_TASK: "Не выполнил тестовое",
  POSITION_CLOSED: "Позиция закрыта",
  // от кандидата
  ACCEPTED_OTHER_OFFER: "Принял другой оффер",
  SALARY_TOO_LOW: "Не устроили деньги",
  NOT_INTERESTED: "Потерял интерес",
  COUNTEROFFER: "Удержали контроффером",
  CONDITIONS_MISMATCH: "Не устроили условия",
  NO_CONTACT: "Перестал выходить на связь",
  NO_SHOW: "Не пришёл",
  OTHER: "Другое",
};

/** Какие причины предлагать в зависимости от того, кто отказывает. */
export const REJECTION_REASONS_BY_SIDE: Record<RejectionSide, RejectionReason[]> = {
  CLIENT: [
    "EXPERIENCE_MISMATCH",
    "SKILLS_MISMATCH",
    "SALARY_TOO_HIGH",
    "CULTURE_FIT",
    "OVERQUALIFIED",
    "LOCATION",
    "FAILED_INTERVIEW",
    "FAILED_TEST_TASK",
    "POSITION_CLOSED",
    "OTHER",
  ],
  CANDIDATE: [
    "ACCEPTED_OTHER_OFFER",
    "SALARY_TOO_LOW",
    "NOT_INTERESTED",
    "COUNTEROFFER",
    "CONDITIONS_MISMATCH",
    "NO_CONTACT",
    "NO_SHOW",
    "OTHER",
  ],
  AGENCY: [
    "EXPERIENCE_MISMATCH",
    "SKILLS_MISMATCH",
    "SALARY_TOO_HIGH",
    "NO_CONTACT",
    "OTHER",
  ],
};

export const REJECTION_SIDE_LABELS: Record<RejectionSide, string> = {
  CLIENT: "Клиент отказал",
  CANDIDATE: "Кандидат отказался",
  AGENCY: "Сняли сами",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SLOTS_REQUESTED: "Нужно предложить время",
  SLOTS_PROPOSED: "Кандидат выбирает",
  CONFIRMED: "Назначено",
  RESCHEDULE_REQUESTED: "Переносим",
  COMPLETED: "Проведено",
  CANCELLED: "Отменено",
  NO_SHOW: "Не пришёл",
};

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  SCREENING: "Скрининг рекрутера",
  CLIENT: "Интервью с клиентом",
  FINAL: "Финальное интервью",
  TEST_TASK_REVIEW: "Разбор тестового",
};

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  ONLINE: "Онлайн",
  OFFICE: "В офисе",
  PHONE: "По телефону",
};

export const CANDIDATE_SOURCE_LABELS: Record<CandidateSource, string> = {
  HH: "hh.ru",
  AVITO: "Авито Работа",
  TELEGRAM: "Telegram",
  LINKEDIN: "LinkedIn",
  REFERRAL: "Рекомендация",
  OWN_BASE: "Своя база",
  DIRECT_SEARCH: "Прямой поиск",
  INBOUND: "Входящий отклик",
  OTHER: "Другое",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Полная занятость",
  PART_TIME: "Частичная занятость",
  PROJECT: "Проектная работа",
  GPH: "Договор ГПХ",
  SELF_EMPLOYED: "Самозанятый",
};
