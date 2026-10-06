/**
 * Каталог событий (ТЗ 9.2).
 *
 * Один источник правды: код события, каналы по умолчанию и приоритет.
 * Тексты собираются здесь же — иначе они расползутся по сервисам
 * и в письмах заведётся разнобой.
 */

/*
  "push" в определениях событий не пишется и добавляется при рассылке —
  см. enabledChannels в notify.ts: пуш идёт на все события тем, кто включил
  его на устройстве. Иначе каждое событие каталога пришлось бы править
  дважды. "vk" — срочное в мессенджер, его события перечисляют сами.
*/
export type Channel = "email" | "vk" | "push";

/*
  Почта получает все поводы без исключения (решение заказчика 21.09.2026,
  перенесено из CRM агентства). Раньше шесть событий жили только в мессенджере
  или только в интерфейсе — решение клиента, комментарий, личное сообщение,
  просьба предложить время, напоминание за час и назначение рекрутера. Бот
  привязан не у каждого, и для такого человека эти поводы не приходили
  никуда, кроме колокольчика.

  Добавляя событие, ставь "email" — исключение нужно обосновывать, а не
  наоборот. Тонкая настройка остаётся за человеком: категории в настройках
  уведомлений. Сторож — tests/notifications.test.ts.
*/

/**
 * Каналы по сторонам.
 *
 * ВКонтакте требует, чтобы человек сам привязал страницу и разрешил
 * сообществу писать. Для своих это нормально, а клиенту навязывать лишний
 * шаг ради доступа к кабинету — плохая сделка. Поэтому агентству по
 * умолчанию бот, клиенту почта; привязать ВКонтакте клиент может сам
 * в настройках, и тогда он начнёт получать и туда.
 *
 * Пуш — по подписке устройства с обеих сторон: его включают на каждом
 * устройстве отдельно, кнопкой в настройках, так что «навязать» его
 * нельзя никому, и без подписки слать его некуда.
 */
export function channelsForSide(
  channels: readonly Channel[],
  isAgencySide: boolean,
  hasVk = false,
  hasPush = false,
): Channel[] {
  return channels.filter((channel) => {
    // Клиенту мессенджер — только по его собственной привязке
    if (channel === "vk") return isAgencySide || hasVk;
    if (channel === "push") return hasPush;
    return true;
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
  | "digest"
  | "students";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  leads: "Заявки с сайта",
  vacancies: "Вакансии",
  candidates: "Кандидаты и решения",
  discussion: "Обсуждения",
  interviews: "Интервью",
  finance: "Счета",
  digest: "Сводки",
  students: "Студенческая платформа",
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
    channels: ["email", "vk"],
    priority: "high",
    description: "Новая заявка с сайта",
    category: "leads",
  },

  // --- Вакансии ---
  VACANCY_SUBMITTED: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Клиент отправил новую заявку на подбор",
    category: "vacancies",
  },
  VACANCY_ESTIMATED: {
    channels: ["email", "vk"],
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
    channels: ["email"],
    priority: "low",
    description: "Назначен рекрутер на вакансию",
    category: "vacancies",
  },

  // --- Кандидаты ---
  CANDIDATE_PRESENTED: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Вам представили нового кандидата",
    category: "candidates",
  },
  CLIENT_DECISION_MADE: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Клиент принял решение по кандидату",
    category: "candidates",
  },
  CLIENT_DECISION_OVERDUE: {
    channels: ["email", "vk"],
    priority: "high",
    description: "По кандидату долго нет решения",
    category: "candidates",
  },
  // Сорсинг-лид без согласия: за три дня до конца срока — тому, кто его
  // завёл (lib/services/sourcing.ts). Без напоминания данные коллеги
  // уходили бы в уничтожение молча
  SOURCING_EXPIRES_SOON: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Кандидат без согласия скоро будет удалён",
    category: "candidates",
  },

  // --- Обсуждение ---
  NEW_COMMENT: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Новый комментарий в обсуждении",
    category: "discussion",
  },

  /*
    Личное сообщение живёт в той же категории, что и обсуждения:
    для человека это одно и то же — ему написали. Отдельная категория
    означала бы ещё один переключатель в настройках ради различия,
    которого он не проводит.

    Почта здесь была выключена нарочно: письмо на каждую реплику
    превращает почту в чат. Решение заказчика от 21.09.2026 — почта
    получает всё, без исключений: ВК привязан не у всех, и повод,
    который не пришёл ни письмом, ни в бот, человек просто пропускает.
    Поток писем сдерживает схлопывание (BR-30): за 15 минут по одному
    ключу уходит первое письмо и одна сводка, а не реплика за репликой.
  */
  NEW_MESSAGE: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Личное сообщение",
    category: "discussion",
  },

  // --- Интервью ---
  INTERVIEW_SLOTS_REQUESTED: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Нужно предложить время для интервью",
    category: "interviews",
  },
  INTERVIEW_CONFIRMED: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Кандидат выбрал время интервью",
    category: "interviews",
  },
  INTERVIEW_REMINDER_24H: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Напоминание за сутки до интервью",
    category: "interviews",
  },
  INTERVIEW_REMINDER_1H: {
    channels: ["email", "vk"],
    priority: "high",
    description: "Напоминание за час до интервью",
    category: "interviews",
  },
  INTERVIEW_RESCHEDULED: {
    channels: ["email", "vk"],
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
  ACCOUNT_DELETION_REQUESTED: {
    channels: ["email"],
    priority: "high",
    description: "Клиент просит удалить аккаунт",
    category: "finance",
  },
  ACCOUNT_DELETION_REJECTED: {
    channels: ["email"],
    priority: "normal",
    description: "Запрос на удаление аккаунта отклонён",
    category: "finance",
  },
  CONTRACT_UPLOADED: {
    channels: ["email"],
    priority: "high",
    description: "Клиент прислал подписанный договор",
    category: "finance",
  },
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

  // --- Студенческая платформа (см. app/api/webhooks/students-event) ---
  // Только мессенджер молчал бы для всех, кто бота не привязал, — а бот
  // для этих событий пока никто специально не настраивал. Почта здесь
  // не разговор, а очередь дел на проверку — ей самое место.
  STUDENTS_COMPANY_PENDING: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Новая компания ждёт проверки на студенческой платформе",
    category: "students",
  },
  STUDENTS_VACANCY_PENDING: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Новая вакансия ждёт проверки на студенческой платформе",
    category: "students",
  },
  STUDENTS_STUDY_PENDING: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Справка студента ждёт проверки",
    category: "students",
  },
  STUDENTS_CRM_LINK_REQUESTED: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Компания просит объединить профиль с клиентом в CRM",
    category: "students",
  },

  // Клиенту, а не агентству: событие приходит с платформы по клиенту-получателю.
  // Письмо получает каждый сотрудник компании на свой адрес (раньше платформа слала одно
  // письмо на единственный адрес компании); ВК — лишь у тех, кто привязал страницу
  STUDENTS_APPLICATION_NEW: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Новый отклик студента на вашу вакансию",
    category: "students",
  },
  STUDENTS_MESSAGE_NEW: {
    channels: ["email", "vk"],
    priority: "normal",
    description: "Новое сообщение от студента",
    category: "students",
  },
  STUDENTS_VACANCY_DECISION: {
    channels: ["email"],
    priority: "high",
    description: "Решение по вашей вакансии на студенческой платформе",
    category: "students",
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
