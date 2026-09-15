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
  .refine((v) => v.phone || v.email, {
    message: "Нужен хотя бы один контакт — телефон или почта",
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
    rejectionReason: z.enum([
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
    ]),
    rejectedBy: z.enum(["CLIENT", "CANDIDATE", "AGENCY"]),
    rejectionComment: optionalText(2000),
  })
  // «Другое» без пояснения — это дыра в аналитике, поэтому комментарий
  // обязателен именно здесь (BR-11)
  .refine((v) => v.rejectionReason !== "OTHER" || !!v.rejectionComment, {
    message: "Для причины «Другое» напишите, что именно не подошло",
    path: ["rejectionComment"],
  });

export type RejectInput = z.infer<typeof rejectSchema>;
