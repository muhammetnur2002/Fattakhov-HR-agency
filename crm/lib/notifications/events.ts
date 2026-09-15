/**
 * Каталог событий (ТЗ 9.2).
 *
 * Один источник правды: код события, каналы по умолчанию и приоритет.
 * Тексты собираются здесь же — иначе они расползутся по сервисам
 * и в письмах заведётся разнобой.
 */

export type Channel = "email" | "telegram";

/**
 * Каналы по сторонам.
 *
 * Telegram требует, чтобы человек сам запустил бота и привязал чат.
 * Для своих это нормально, а клиенту навязывать лишний шаг ради
 * доступа к кабинету — плохая сделка. Поэтому агентству по умолчанию
 * бот, клиенту почта; привязать Telegram клиент может сам в настройках,
 * и тогда он начнёт получать и туда.
 */
export function channelsForSide(
  channels: readonly Channel[],
  isAgencySide: boolean,
  hasTelegram: boolean,
): Channel[] {
  return channels.filter((channel) => {
    if (channel !== "telegram") return true;
    // Клиенту — только если он сам привязал бота
    return isAgencySide || hasTelegram;
  });
}

export type EventPriority = "high" | "normal" | "low";

/**
 * Категория события — единица настройки уведомлений (ТЗ 9.2 расширено).
 *
 * Тридцать переключателей по одному на событие никто не настраивает,
 * но «письма про счета» и «письма про кандидатов» — это уже осмысленный
 * выбор, который у нас просили и которого раньше не было вовсе
 * (можно было выключить только весь канал целиком).
 */
export type EventCategory =
  | "leads"
  | "vacancies"
  | "candidates"
  | "discussion"
  | "interviews"
  | "finance"
  | "digest";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  leads: "Заявки с сайта",
  vacancies: "Вакансии",
  candidates: "Кандидаты и решения",
  discussion: "Обсуждения",
  interviews: "Интервью",
  finance: "Счета",
  digest: "Сводки",
};

export type EventDefinition = {
  /** Каналы помимо интерфейса. Уведомление в колокольчике есть всегда. */
  channels: Channel[];
  priority: EventPriority;
  /** Человеку понятное описание — для настроек уведомлений. */
  description: string;
  category: EventCategory;
};

export const EVENTS = {
  // --- Лендинг ---
  LEAD_RECEIVED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Новая заявка с сайта",
    category: "leads",
  },

  // --- Вакансии ---
  VACANCY_SUBMITTED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Клиент отправил новую заявку на подбор",
    category: "vacancies",
  },
  VACANCY_ESTIMATED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Агентство назвало сроки по заявке",
    category: "vacancies",
  },
  VACANCY_ACTIVATED: {
    channels: ["email"],
    priority: "normal",
    description: "Вакансия взята в работу",
    category: "vacancies",
  },
  VACANCY_CLOSED: {
    channels: ["email"],
    priority: "normal",
    description: "Вакансия закрыта",
    category: "vacancies",
  },
  RECRUITER_ASSIGNED: {
    channels: [],
    priority: "low",
    description: "Назначен рекрутер на вакансию",
    category: "vacancies",
  },

  // --- Кандидаты ---
  CANDIDATE_PRESENTED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Вам представили нового кандидата",
    category: "candidates",
  },
  CLIENT_DECISION_MADE: {
    channels: ["telegram"],
    priority: "high",
    description: "Клиент принял решение по кандидату",
    category: "candidates",
  },
  CLIENT_DECISION_OVERDUE: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "По кандидату долго нет решения",
    category: "candidates",
  },

  // --- Обсуждение ---
  NEW_COMMENT: {
    channels: ["telegram"],
    priority: "high",
    description: "Новый комментарий в обсуждении",
    category: "discussion",
  },

  /*
    Личное сообщение живёт в той же категории, что и обсуждения:
    для человека это одно и то же — ему написали. Отдельная категория
    означала бы ещё один переключатель в настройках ради различия,
    которого он не проводит.

    Только Telegram, как и у комментария: личное сообщение — это
    разговор, а не документ, и письмо на каждую реплику превращает
    почту в чат, которым она быть не должна.
  */
  NEW_MESSAGE: {
    channels: ["telegram"],
    priority: "high",
    description: "Личное сообщение",
    category: "discussion",
  },

  // --- Интервью ---
  INTERVIEW_SLOTS_REQUESTED: {
    channels: ["telegram"],
    priority: "high",
    description: "Нужно предложить время для интервью",
    category: "interviews",
  },
  INTERVIEW_CONFIRMED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Кандидат выбрал время интервью",
    category: "interviews",
  },
  INTERVIEW_REMINDER_24H: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Напоминание за сутки до интервью",
    category: "interviews",
  },
  INTERVIEW_REMINDER_1H: {
    channels: ["telegram"],
    priority: "high",
    description: "Напоминание за час до интервью",
    category: "interviews",
  },
  INTERVIEW_RESCHEDULED: {
    channels: ["email", "telegram"],
    priority: "high",
    description: "Интервью переносится",
    category: "interviews",
  },
  INTERVIEW_FEEDBACK_REQUEST: {
    channels: ["email"],
    priority: "normal",
    description: "Просьба оставить отзыв после интервью",
    category: "interviews",
  },

  // --- Финансы ---
  INVOICE_ISSUED: {
    channels: ["email"],
    priority: "high",
    description: "Выставлен счёт",
    category: "finance",
  },
  INVOICE_OVERDUE: {
    channels: ["email"],
    priority: "high",
    description: "Счёт просрочен",
    category: "finance",
  },

  // --- Сводка ---
  WEEKLY_DIGEST: {
    channels: ["email"],
    priority: "low",
    description: "Еженедельная сводка по вакансиям",
    category: "digest",
  },
} as const satisfies Record<string, EventDefinition>;

export type EventCode = keyof typeof EVENTS;

export function eventDefinition(code: EventCode): EventDefinition {
  return EVENTS[code];
}

/** Категории, которые реально приходят хоть кому-то — не показываем в настройках пустые. */
export function categoriesInUse(): EventCategory[] {
  const set = new Set<EventCategory>();
  for (const code of Object.keys(EVENTS) as EventCode[]) {
    set.add(EVENTS[code].category);
  }
  return [...set];
}

/**
 * Текст уведомления обрезается на длинных комментариях и саммари — иначе
 * многоточия не было, и обрезанный текст выглядел не сокращённым,
 * а просто оборванным на середине слова.
 */
export function truncateBody(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * Множественное число для схлопнутых уведомлений: «3 новых кандидата».
 * Отдельная функция, потому что по-русски это три разные формы.
 */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
