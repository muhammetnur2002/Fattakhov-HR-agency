import { z } from "zod";

/** Пустая строка из формы → undefined, чтобы в БД не легли "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** Числовое поле формы: "" → undefined, "150000" → 150000. */
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
    message: "Некорректная дата",
  });

/**
 * Необязательный enum из формы.
 *
 * Незаполненный `select` присылает пустую строку, а `z.enum().optional()`
 * её не принимает — поэтому приводим к undefined до проверки.
 */
const optionalEnum = <const T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z
    .union([z.enum(values), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/**
 * Чекбокс/селект «да-нет» из формы.
 *
 * `z.coerce.boolean()` здесь непригоден: строка "false" непустая,
 * и он превратил бы её в true — вилка gross молча стала бы net.
 */
const formBoolean = (fallback: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return fallback;
    if (typeof v === "boolean") return v;
    return v === "true" || v === "on" || v === "1";
  }, z.boolean());

/** Шаг 1 — позиция. Единственное поле, без которого заявка не имеет смысла. */
export const vacancyStep1Schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Укажите название позиции")
    .max(200, "Слишком длинное название"),
  department: optionalText(150),
  hiringManagerId: optionalText(40),
  headcount: z.coerce.number().int().min(1, "Минимум 1").max(500).default(1),
  reasonForHire: optionalText(500),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  desiredStartDate: optionalDate,
});

/** Шаг 2 — требования. */
export const vacancyStep2Schema = z.object({
  responsibilities: optionalText(5000),
  requirements: optionalText(5000),
  niceToHave: optionalText(3000),
  stopFactors: optionalText(2000),
  targetCompanies: optionalText(2000),
});

/**
 * Шаг 3 — условия.
 *
 * База и проверка вилки разделены: в zod 4 `.refine()` возвращает тот же
 * объект, но собрать из него общий бриф через `.extend()` уже нельзя —
 * форма нужна отдельно от правила.
 */
const vacancyStep3Base = z.object({
  salaryFrom: optionalNumber,
  salaryTo: optionalNumber,
  salaryGross: formBoolean(true),
  bonusScheme: optionalText(1000),
  city: optionalText(120),
  workFormat: optionalEnum(["OFFICE", "REMOTE", "HYBRID"]),
  employmentType: optionalEnum([
    "FULL_TIME",
    "PART_TIME",
    "PROJECT",
    "GPH",
    "SELF_EMPLOYED",
  ]),
  workSchedule: optionalText(200),
  conditions: optionalText(3000),
});

/** Вилка «от» не может быть выше «до» — частая опечатка при заполнении. */
const salaryRangeIsSane = (v: {
  salaryFrom?: number;
  salaryTo?: number;
}) =>
  v.salaryFrom === undefined ||
  v.salaryTo === undefined ||
  v.salaryFrom <= v.salaryTo;

const SALARY_RANGE_ERROR = {
  message: "Нижняя граница вилки больше верхней",
  path: ["salaryTo"],
};

export const vacancyStep3Schema = vacancyStep3Base.refine(
  salaryRangeIsSane,
  SALARY_RANGE_ERROR,
);

/** Шаг 4 — процесс отбора. */
export const vacancyStep4Schema = z.object({
  interviewStages: optionalText(3000),
});

/**
 * Полный бриф — объединение всех шагов.
 *
 * База отдельно от проверки вилки: черновик сохраняется через
 * `vacancyDraftSchema` (то же самое, но все поля необязательны), а zod 4
 * не разрешает `.partial()` на схеме с `.refine()`.
 */
const vacancyBriefBase = vacancyStep1Schema
  .extend(vacancyStep2Schema.shape)
  .extend(vacancyStep3Base.shape)
  .extend(vacancyStep4Schema.shape);

export const vacancyBriefSchema = vacancyBriefBase.refine(
  salaryRangeIsSane,
  SALARY_RANGE_ERROR,
);

/** Схема автосохранения: заполнено может быть что угодно, кроме названия. */
export const vacancyDraftSchema = vacancyBriefBase.partial();

export type VacancyBriefInput = z.infer<typeof vacancyBriefSchema>;

/**
 * Проверка перед отправкой заявки в работу.
 *
 * Требования жёстче, чем у черновика: искать по брифу, где не заполнены
 * ни обязанности, ни требования, невозможно — рекрутер всё равно вернётся
 * с вопросами, только через день.
 */
export const vacancySubmitSchema = z.object({
  title: z.string().trim().min(3, "Укажите название позиции"),
  responsibilities: z
    .string()
    .trim()
    .min(30, "Опишите обязанности — хотя бы пару предложений"),
  requirements: z
    .string()
    .trim()
    .min(30, "Опишите требования к кандидату"),
});

/** Оценка сроков агентством (BR-2). */
export const vacancyEstimateSchema = z.object({
  estimatedFirstCandidatesAt: z
    .string()
    .min(1, "Укажите дату первых кандидатов")
    .transform((v) => new Date(v))
    .refine((d) => !Number.isNaN(d.getTime()), "Некорректная дата"),
  estimatedCloseAt: optionalDate,
});

export const assignRecruitersSchema = z.object({
  leadRecruiterId: optionalText(40),
  recruiterIds: z.array(z.string()).default([]),
});
