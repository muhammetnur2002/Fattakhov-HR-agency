/**
 * Параметры поиска студентов в адресе страницы `/a/reviews/students`.
 *
 * Выборка живёт в адресной строке: ссылку можно скопировать и отправить
 * коллеге. Из адреса берётся только известное и только прошедшее проверку —
 * остальное отбрасывается, а на платформу уходит заново собранный запрос,
 * а не пришедшая строка. Модуль без зависимостей: им пользуются и страница,
 * и форма фильтров.
 */

export const STUDENT_SORTS = ["new", "seen", "name", "university"] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

export const STUDENT_SORT_LABELS: Record<StudentSort, string> = {
  new: "Новые регистрации",
  seen: "Последний вход",
  name: "По имени",
  university: "По вузу",
};

export const STUDENT_GENDER_OPTIONS = [
  { value: "FEMALE", label: "Женский" },
  { value: "MALE", label: "Мужской" },
] as const;

export const STUDENT_STUDY_OPTIONS = [
  { value: "verified", label: "Учёба подтверждена" },
  { value: "pending", label: "Справка на проверке" },
  { value: "none", label: "Учёба не подтверждена" },
] as const;

export const STUDENT_STATUS_OPTIONS = [
  { value: "active", label: "Ищет работу" },
  { value: "paused", label: "На паузе" },
  { value: "placed", label: "Трудоустроен(а)" },
] as const;

/** «В сети за»: минуты. Пульс платформы раз в минуту, поэтому меньше пяти смысла нет. */
export const STUDENT_ONLINE_OPTIONS = [
  { value: "5", label: "Сейчас" },
  { value: "60", label: "За последний час" },
  { value: "1440", label: "За сутки" },
  { value: "10080", label: "За неделю" },
] as const;

export const STUDENTS_PAGE_SIZE = 20;

export type StudentSearchParams = {
  q?: string;
  university?: string;
  speciality?: string;
  studyYear?: string;
  city?: string;
  ageFrom?: string;
  ageTo?: string;
  gender?: string;
  skills?: string;
  study?: string;
  status?: string;
  onlineWithin?: string;
  sort?: StudentSort;
  page?: number;
};

type Raw = Record<string, string | string[] | undefined>;

function first(raw: Raw, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

function text(raw: Raw, key: string, max: number): string | undefined {
  // Управляющие символы в адресе ни к чему: они уйдут в запрос к платформе
  const value = first(raw, key)?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  return value ? value : undefined;
}

function whole(raw: Raw, key: string, min: number, max: number): string | undefined {
  const value = first(raw, key)?.trim();
  if (!value || !/^\d{1,6}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? String(n) : undefined;
}

function oneOf(raw: Raw, key: string, options: readonly { value: string }[]): string | undefined {
  const value = first(raw, key);
  return options.find((o) => o.value === value)?.value;
}

/** Проверенные параметры из адреса страницы. */
export function parseStudentSearchParams(raw: Raw): StudentSearchParams {
  const sort = first(raw, "sort");
  const page = Number(first(raw, "page"));
  const params: StudentSearchParams = {
    q: text(raw, "q", 100),
    university: text(raw, "university", 100),
    speciality: text(raw, "speciality", 100),
    studyYear: whole(raw, "studyYear", 1, 6),
    city: text(raw, "city", 80),
    ageFrom: whole(raw, "ageFrom", 14, 99),
    ageTo: whole(raw, "ageTo", 14, 99),
    gender: oneOf(raw, "gender", STUDENT_GENDER_OPTIONS),
    skills: text(raw, "skills", 300),
    study: oneOf(raw, "study", STUDENT_STUDY_OPTIONS),
    status: oneOf(raw, "status", STUDENT_STATUS_OPTIONS),
    onlineWithin: oneOf(raw, "onlineWithin", STUDENT_ONLINE_OPTIONS),
    sort: (STUDENT_SORTS as readonly string[]).includes(sort ?? "") ? (sort as StudentSort) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : undefined,
  };
  // Перепутанные границы возраста платформа отвергает ошибкой — здесь просто меняем местами
  if (params.ageFrom && params.ageTo && Number(params.ageFrom) > Number(params.ageTo)) {
    [params.ageFrom, params.ageTo] = [params.ageTo, params.ageFrom];
  }
  return params;
}

/** Сколько условий отбора включено (без сортировки и страницы). */
export function countActiveFilters(params: StudentSearchParams): number {
  const keys: (keyof StudentSearchParams)[] = [
    "q",
    "university",
    "speciality",
    "studyYear",
    "city",
    "ageFrom",
    "ageTo",
    "gender",
    "skills",
    "study",
    "status",
    "onlineWithin",
  ];
  return keys.filter((key) => params[key] !== undefined).length;
}

/** Строка запроса: только заданное, без значений по умолчанию. `page` и `sort` по умолчанию опускаются. */
export function studentSearchQuery(params: StudentSearchParams, overrides: Partial<StudentSearchParams> = {}): URLSearchParams {
  const merged = { ...params, ...overrides };
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "") continue;
    if (key === "sort" && value === "new") continue;
    if (key === "page" && value === 1) continue;
    out.set(key, String(value));
  }
  return out;
}
