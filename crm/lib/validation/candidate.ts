import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

/** Телефон приводим к цифрам: так работает поиск дубликатов (BR-7). */
export function normalizePhone(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  // 8XXXXXXXXXX и 7XXXXXXXXXX — один и тот же номер
  const last10 = digits.slice(-10);
  return `7${last10}`;
}

/**
 * Быстрое добавление кандидата.
 *
 * Только имя и способ связи: заставлять рекрутера заполнять двадцать
 * полей, чтобы завести человека, — верный способ получить базу,
 * которую никто не ведёт (ТЗ 7.3.5).
 */
export const quickCandidateSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Укажите имя и фамилию")
      .max(200, "Слишком длинное имя"),
    phone: optionalText(50),
    email: optionalText(200),
    telegram: optionalText(100),
    // Поля профиля до согласия не сохраняются (сорсинг-лид), но разбираются:
    // форма, открытая до выкатки, может их прислать — сервис откажет
    // с объяснением, а не потеряет их молча
    currentPosition: optionalText(200),
    currentCompany: optionalText(200),
    city: optionalText(120),
    salaryExpectation: optionalNumber,
    source: z
      .enum([
        "HH",
        "AVITO",
        "TELEGRAM",
        "LINKEDIN",
        "REFERRAL",
        "OWN_BASE",
        "DIRECT_SEARCH",
        "INBOUND",
        "OTHER",
      ])
      .default("OTHER"),
    sourceDetails: optionalText(500),
  })
  .refine((v) => v.phone || v.email || v.telegram, {
    message: "Нужен хотя бы один контакт — телефон, почта или Telegram",
    path: ["phone"],
  });

export type QuickCandidateInput = z.infer<typeof quickCandidateSchema>;

export const candidateProfileSchema = z.object({
  fullName: z.string().trim().min(3, "Укажите имя и фамилию").max(200),
  phone: optionalText(50),
  email: optionalText(200),
  telegram: optionalText(100),
  city: optionalText(120),
  currentPosition: optionalText(200),
  currentCompany: optionalText(200),
  totalExperienceYears: optionalNumber,
  education: optionalText(2000),
  salaryExpectation: optionalNumber,
  // Внутреннее саммари рекрутера. Клиенту не показывается никогда.
  summary: optionalText(4000),
  skills: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
});

export type CandidateProfileInput = z.infer<typeof candidateProfileSchema>;

/** Материалы представления клиенту (BR-4). */
export const presentSchema = z.object({
  presentationSummary: z
    .string()
    .trim()
    .min(100, "Опишите, почему кандидат подходит — минимум 100 символов"),
  salaryExpectation: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && n > 0, "Укажите зарплатное ожидание"),
});

/**
 * Отказ (BR-11).
 *
 * Причина обязательна всегда: именно из неё потом собирается отчёт,
 * по которому рекрутер перекалибровывает поиск. «Этот не очень»
 * текстом такой пользы не даёт.
 */
export const rejectSchema = z
  .object({
    /*
      Свой текст ошибки здесь обязателен, а не «для красоты».

      Незаполненный `select` присылает пустую строку, и zod по умолчанию
      отвечает перечнем допустимых значений — то есть внутренними кодами
      латиницей. Действие показывает первое сообщение разбора дословно
      (rejectAction), и рекрутер, забывший выбрать причину, видел
      «Invalid option: expected one of "EXPERIENCE_MISMATCH"|…» вместо
      просьбы выбрать причину. Два случая разведены намеренно: пусто —
      человек не выбрал, значение не из списка — прислали код, которого
      в схеме нет, и «выберите из списка» тут сбивало бы с толку.
    */
    rejectionReason: z.enum(
      [
        "EXPERIENCE_MISMATCH",
        "SKILLS_MISMATCH",
        "SALARY_TOO_HIGH",
        "CULTURE_FIT",
        "OVERQUALIFIED",
        "LOCATION",
        "FAILED_INTERVIEW",
        "FAILED_TEST_TASK",
        "POSITION_CLOSED",
        "ACCEPTED_OTHER_OFFER",
        "SALARY_TOO_LOW",
        "NOT_INTERESTED",
        "COUNTEROFFER",
        "CONDITIONS_MISMATCH",
        "NO_CONTACT",
        "NO_SHOW",
        "OTHER",
      ],
      {
        error: (issue) =>
          issue.input
            ? "Такой причины нет в списке — выберите одну из предложенных"
            : "Выберите причину отказа",
      },
    ),
    rejectedBy: z.enum(["CLIENT", "CANDIDATE", "AGENCY"], {
      error: "Укажите, кто отказал",
    }),
    rejectionComment: optionalText(2000),
  })
  // «Другое» без пояснения — это дыра в аналитике, поэтому комментарий
  // обязателен именно здесь (BR-11)
  .refine((v) => v.rejectionReason !== "OTHER" || !!v.rejectionComment, {
    message: "Для причины «Другое» напишите, что именно не подошло",
    path: ["rejectionComment"],
  });

export type RejectInput = z.infer<typeof rejectSchema>;

/**
 * Условия оффера.
 *
 * Сумма — в месяц и на руки или до вычета, как договорились; поле одно,
 * потому что вознаграждение по договору считается именно от неё (BR-31).
 * Дата выхода необязательна, но от неё отсчитывается гарантия: без неё
 * гарантия начнётся в момент найма.
 */
export const offerSchema = z.object({
  salary: z.coerce
    .number({ error: "Укажите сумму оффера" })
    .positive("Сумма оффера должна быть больше нуля")
    .max(100_000_000, "Слишком большая сумма"),
  position: optionalText(200),
  startDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
      message: "Проверьте дату выхода",
    }),
});

export type OfferInput = z.infer<typeof offerSchema>;

/**
 * Гарантийный случай (BR-10).
 *
 * Дата ухода обязательна: по ней, а не по дате записи, решается,
 * случилось ли это в гарантийный срок. Записать случай могут и через
 * неделю после ухода — клиент сообщает не сразу.
 */
export const guaranteeCaseSchema = z.object({
  leftAt: z
    .string({ error: "Укажите, когда человек ушёл" })
    .trim()
    .min(1, "Укажите, когда человек ушёл")
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), { message: "Проверьте дату ухода" }),
  reason: z.enum(["CANDIDATE_LEFT", "DISMISSED", "PROBATION_FAILED", "OTHER"], {
    error: "Выберите причину",
  }),
  comment: optionalText(1000),
  // Чекбокс: пришёл «on» — отмечен, не пришёл — нет. Не z.coerce.boolean:
  // он превращает строку "false" в true (правило проекта 4)
  reopenVacancy: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export type GuaranteeCaseInput = z.infer<typeof guaranteeCaseSchema>;
