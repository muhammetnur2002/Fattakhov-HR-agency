/**
 * Единственное место, где момент времени превращается в текст для человека.
 *
 * Зона всегда названа явно. Раньше каждый экран вызывал Intl без зоны, и
 * результат зависел от того, кто считает: серверный рендер — в зоне
 * процесса (контейнер стоит в UTC), гидратация — в зоне браузера. Отсюда
 * ошибка «Text content does not match» и часы, которые на глаз сдвигались
 * на три часа между первым кадром и вторым. Теперь зону берёт тот, кто
 * знает человека: страница кабинета — из `User.timezone`
 * (`getUserTimeZone()`), клиентский компонент — из `useTimeZone()`,
 * публичная страница и сайт — `DEFAULT_TIME_ZONE`. Сервер и браузер при
 * одинаковой зоне дают одинаковую строку.
 *
 * Правила проекта: в базе всё в UTC, показ — в зоне пользователя,
 * перевод «настенного» времени из формы в момент — только через
 * `lib/calendar/timezone.ts`. Напрямую `toLocale*String` и
 * `Intl.DateTimeFormat` вне этого файла запрещены тестом
 * `tests/time-zone-rule.test.ts`.
 */

/** Момент времени в любом виде, в каком он приходит: Date, строка ISO или число миллисекунд. */
export type Moment = Date | string | number;

/** Зона агентства и запасная для тех, у кого своей нет: сервер и браузер сходятся на ней. */
export const DEFAULT_TIME_ZONE = "Europe/Moscow";

const KNOWN_ZONES = new Map<string, boolean>();

/**
 * Зона, в которой браузер сейчас показывает время. Только в браузере и
 * только для выбора зоны по умолчанию там, где человек без аккаунта
 * (кандидат на странице выбора времени) и своей зоны у нас нет. Для
 * разметки сервера её брать нельзя: он ответит своей.
 */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? resolveTimeZone(zone) : null;
  } catch {
    return null;
  }
}

/**
 * Зона, которую понимает Intl, или запасная.
 *
 * `User.timezone` — свободная строка из базы: опечатка или устаревшее имя
 * зоны иначе бросило бы RangeError посреди рендера страницы.
 */
export function resolveTimeZone(zone?: string | null): string {
  if (!zone) return DEFAULT_TIME_ZONE;
  const known = KNOWN_ZONES.get(zone);
  if (known !== undefined) return known ? zone : DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: zone });
    KNOWN_ZONES.set(zone, true);
    return zone;
  } catch {
    KNOWN_ZONES.set(zone, false);
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Виды записи. Названы по результату, а не по набору параметров: человек
 * выбирает «дата и время», а не «day 2-digit, month 2-digit, hour…».
 * Пример — для 6 августа 2026, 14:30.
 */
const FORMATS = {
  /** 06 августа 2026 г. — договор, счёт, документы. */
  dateLong: { day: "2-digit", month: "long", year: "numeric" },
  /** 06.08.2026 */
  dateNumeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** 6 августа */
  dayMonth: { day: "numeric", month: "long" },
  /** 06 августа */
  dayMonthPadded: { day: "2-digit", month: "long" },
  /** 6 авг. */
  dayMonthShort: { day: "numeric", month: "short" },
  /** 14:30 */
  time: { hour: "2-digit", minute: "2-digit" },
  /** 06.08, 14:30 */
  dateTime: { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  /** 06.08, 14:30:05 — журналы. */
  dateTimeSeconds: {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  },
  /** 6 августа в 14:30 */
  dayMonthTime: { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
  /** 06 августа в 14:30 — письмо о входе с нового устройства. */
  dayMonthPaddedTime: { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" },
  /** четверг, 6 августа */
  weekdayDayMonth: { weekday: "long", day: "numeric", month: "long" },
  /** четверг, 6 августа в 14:30 */
  weekdayDayMonthTime: {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  },
  /** чт, 6 августа в 14:30 */
  weekdayShortDayMonthTime: {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateFormat = keyof typeof FORMATS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(format: DateFormat, timeZone: string): Intl.DateTimeFormat {
  const key = `${format}|${timeZone}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("ru-RU", { ...FORMATS[format], timeZone });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Момент → строка нужного вида в зоне. Пустая или битая зона — запасная. */
export function formatInZone(
  value: Moment,
  format: DateFormat,
  timeZone?: string | null,
): string {
  return formatterFor(format, resolveTimeZone(timeZone)).format(new Date(value));
}

/** 06 августа 2026 г. Длинный месяц — канонический вид для договора и счёта. */
export function formatDate(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "dateLong", timeZone);
}

/** 06.08.2026 */
export function formatDateNumeric(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "dateNumeric", timeZone);
}

/** 6 августа */
export function formatDayMonth(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "dayMonth", timeZone);
}

/** 14:30 */
export function formatTime(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "time", timeZone);
}

/** 06.08, 14:30 */
export function formatDateTime(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "dateTime", timeZone);
}

/** 6 августа в 14:30 */
export function formatDayMonthTime(date: Moment, timeZone?: string | null): string {
  return formatInZone(date, "dayMonthTime", timeZone);
}

// ─── Календарные дни в зоне ────────────────────────────────────────────────

const dayParts = new Map<string, Intl.DateTimeFormat>();

/** Год, месяц и число момента в зоне — числами, без разбора готовой строки. */
function zonedYmd(value: Moment, timeZone: string): [number, number, number] {
  let formatter = dayParts.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayParts.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}

export type ZonedClock = { year: number; month: number; day: number; hour: number; minute: number };

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Показания часов в зоне числами: год, месяц, число, час, минута. Для тех,
 * кто строит свою фразу («был(а) вчера в 21:40») и не может взять готовый вид.
 */
export function zonedClock(value: Moment, timeZone?: string | null): ZonedClock {
  const zone = resolveTimeZone(timeZone);
  let formatter = clockFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    clockFormatters.set(zone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(value))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** Календарный день момента в зоне: `2026-08-06`. Ключ для группировки и сравнения. */
export function zonedDayKey(value: Moment, timeZone?: string | null): string {
  const [y, m, d] = zonedYmd(value, resolveTimeZone(timeZone));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * На сколько календарных дней `later` позже `earlier` в зоне (0 — тот же
 * день, 1 — следующий). Считается по датам, а не делением на 24 часа:
 * 23:50 и 00:10 соседних суток — это один день разницы, хоть и двадцать минут.
 */
export function zonedDayDiff(
  later: Moment,
  earlier: Moment,
  timeZone?: string | null,
): number {
  const zone = resolveTimeZone(timeZone);
  const [y1, m1, d1] = zonedYmd(later, zone);
  const [y2, m2, d2] = zonedYmd(earlier, zone);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

/**
 * Подпись времени последнего сообщения в списке бесед: сегодня — только
 * время, раньше — короткая дата, как в любом мессенджере.
 */
export function formatMessageStamp(
  value: Moment,
  now: Moment,
  timeZone?: string | null,
): string {
  return zonedDayDiff(now, value, timeZone) === 0
    ? formatInZone(value, "time", timeZone)
    : formatInZone(value, "dayMonthShort", timeZone);
}

/** Разделитель дня в ленте: «Сегодня», «Вчера» или «6 августа». */
export function formatDayDivider(
  value: Moment,
  now: Moment,
  timeZone?: string | null,
): string {
  const days = zonedDayDiff(now, value, timeZone);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return formatInZone(value, "dayMonth", timeZone);
}

/** Дата для имени файла выгрузки: `06-08-2026`. */
export function formatDateForFileName(
  value: Moment,
  timeZone?: string | null,
): string {
  return formatInZone(value, "dateNumeric", timeZone).replace(/\./g, "-");
}
