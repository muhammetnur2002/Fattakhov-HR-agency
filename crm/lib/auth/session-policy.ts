/**
 * Предельный возраст сессии.
 *
 * Сессии у нас в JWT, и cookie, украденная с компьютера (вредоносной
 * программой, из резервной копии браузера), даёт вход без пароля и без
 * второго фактора. Закрыть это полностью нельзя, но можно ограничить окно:
 * сессия живёт не дольше предела от момента ВХОДА — продление раз в сутки
 * (Auth.js updateAge) возраст не обнуляет, потому что отсчёт идёт от
 * `issuedAt`, а он ставится только при входе.
 *
 * Предел задаёт владелец в настройках (Organization.settings), отдельно для
 * сотрудников агентства и для клиентов: от 20 минут до 30 суток. Пока он
 * не задан, действует умолчание: агентство 72 часа (оно работает с
 * персональными данными), клиент 14 суток. Умолчание можно сменить без
 * правки кода: SESSION_MAX_HOURS_AGENCY и SESSION_MAX_HOURS_CLIENT (часы),
 * неверное значение игнорируется.
 *
 * Предел абсолютный: по истечении входить нужно заново, даже если человек
 * всё время работал. Чем он короче, тем чаще вход (и 2FA у сотрудников
 * агентства), поэтому 20 минут — осознанный выбор владельца, не умолчание.
 */
export const DEFAULT_AGENCY_SESSION_HOURS = 72;
export const DEFAULT_CLIENT_SESSION_HOURS = 14 * 24;

/** Нижняя и верхняя граница, которые может задать владелец, минуты. */
export const MIN_SESSION_MINUTES = 20;
export const MAX_SESSION_MINUTES = 30 * 24 * 60;

/** Варианты в настройках: минуты и подпись. 0 — «по умолчанию». */
export const SESSION_CHOICES: { minutes: number; label: string }[] = [
  { minutes: MIN_SESSION_MINUTES, label: "20 минут" },
  { minutes: 60, label: "1 час" },
  { minutes: 8 * 60, label: "8 часов (рабочий день)" },
  { minutes: 24 * 60, label: "1 сутки" },
  { minutes: 3 * 24 * 60, label: "3 суток" },
  { minutes: 7 * 24 * 60, label: "7 суток" },
  { minutes: 14 * 24 * 60, label: "14 суток" },
];

export type SessionKind = "agency" | "client";

/** Предел из настроек владельца, минуты. Ключ — по роли: sessionMinutesAgency / sessionMinutesClient. */
export type SessionLimits = { agency: number | null; client: number | null };

/** Целое число минут в допустимых границах, иначе null. */
export function parseSessionMinutes(value: unknown): number | null {
  const minutes = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) return null;
  return minutes >= MIN_SESSION_MINUTES && minutes <= MAX_SESSION_MINUTES ? minutes : null;
}

/** Пределы из Organization.settings. Мусор и чужие поля игнорируются. */
export function readSessionLimits(settings: unknown): SessionLimits {
  const source =
    typeof settings === "object" && settings !== null ? (settings as Record<string, unknown>) : {};
  return {
    agency: parseSessionMinutes(source.sessionMinutesAgency),
    client: parseSessionMinutes(source.sessionMinutesClient),
  };
}

function hoursFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  // Не меньше часа и не больше 30 дней: ноль и «бесконечность» — почти наверняка опечатка
  return Number.isFinite(value) && value >= 1 && value <= 30 * 24 ? Math.floor(value) : fallback;
}

/** Предел в секундах: из настроек владельца, иначе умолчание (переменная окружения или встроенное). */
export function sessionMaxAgeSeconds(kind: SessionKind, limits?: SessionLimits | null): number {
  const fromOwner = limits?.[kind] ?? null;
  if (fromOwner !== null) return fromOwner * 60;
  const hours =
    kind === "agency"
      ? hoursFromEnv("SESSION_MAX_HOURS_AGENCY", DEFAULT_AGENCY_SESSION_HOURS)
      : hoursFromEnv("SESSION_MAX_HOURS_CLIENT", DEFAULT_CLIENT_SESSION_HOURS);
  return hours * 3600;
}

/**
 * Вышел ли срок сессии. Сессия без отметки выпуска считается просроченной:
 * отсчитать её возраст не от чего, а пропустить такую значило бы оставить
 * бессрочную дыру.
 */
export function isSessionTooOld(
  issuedAt: number | null | undefined,
  kind: SessionKind,
  nowMs: number = Date.now(),
  limits?: SessionLimits | null,
): boolean {
  if (issuedAt === null || issuedAt === undefined) return true;
  return nowMs / 1000 - issuedAt > sessionMaxAgeSeconds(kind, limits);
}
