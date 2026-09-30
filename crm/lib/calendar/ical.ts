import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Сборка iCalendar (RFC 5545).
 *
 * Двусторонней синхронизации с Google и Яндексом в v1 нет намеренно
 * (ТЗ 10.1): OAuth, вебхуки и разрешение конфликтов — это отдельный
 * проект. Подписка на фид закрывает ту же потребность за вечер работы:
 * человек подписывается один раз, дальше встречи приходят к нему сами.
 */

export type CalendarEvent = {
  uid: string;
  startsAt: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Отменённые события уходят из календаря подписчика. */
  cancelled?: boolean;
};

/**
 * Экранирование по RFC 5545: обратный слеш, запятая, точка с запятой
 * и перевод строки имеют в формате особый смысл.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC в формате 20260812T100000Z. */
function formatDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Сворачивание длинных строк.
 *
 * Спецификация требует не длиннее 75 октетов; кириллица в UTF-8 занимает
 * два байта на символ, поэтому режем по байтам, а не по символам —
 * иначе Outlook показывает обрезанные названия.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    // Первая строка 75 байт, продолжения — 74 плюс ведущий пробел
    const limit = parts.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);

    // Не разрезаем многобайтовый символ посередине
    while (end > start && (bytes[end] & 0b1100_0000) === 0b1000_0000) end--;

    parts.push(decoder.decode(bytes.slice(start, end)));
    start = end;
  }

  return parts.join("\r\n ");
}

export function buildCalendar(params: {
  name: string;
  events: CalendarEvent[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HR Platform//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(params.name)}`,
    // Подсказка календарю, как часто перечитывать фид
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  const now = formatDate(new Date());

  for (const event of params.events) {
    const end = new Date(
      event.startsAt.getTime() + event.durationMinutes * 60_000,
    );

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatDate(event.startsAt)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeText(event.url)}`);
    }
    lines.push(`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Персональный токен подписки на календарь.
 *
 * Устроен как `<id>.<подпись>` (версия 0) или `<id>.<версия>.<подпись>`: подпись не даёт
 * подобрать чужую ссылку, а id внутри позволяет понять, чей это фид.
 *
 * Версия хранится у пользователя (User.calendarTokenVersion). Кнопка «Обновить ссылку»
 * увеличивает её, и все прежние ссылки перестают работать — не трогая остальных людей
 * и сессии. Ссылки версии 0 имеют прежний вид, поэтому уже выданные подписки не ломаются.
 */
function sign(userId: string, version: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не задан");
  return createHmac("sha256", secret)
    .update(version === 0 ? `calendar:${userId}` : `calendar:${userId}:${version}`)
    .digest("base64url");
}

export function calendarTokenFor(userId: string, version = 0): string {
  const id = Buffer.from(userId).toString("base64url");
  return version === 0 ? `${id}.${sign(userId, 0)}` : `${id}.${version}.${sign(userId, version)}`;
}

/** Id пользователя и версия ссылки или null, если подпись не сходится. */
export function parseCalendarTokenVersioned(token: string): { userId: string; version: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const [encodedId, ...rest] = parts;
  const signature = rest[rest.length - 1];
  if (!encodedId || !signature) return null;

  let version = 0;
  if (parts.length === 3) {
    if (!/^[1-9]\d{0,8}$/.test(rest[0])) return null;
    version = Number(rest[0]);
  }

  let userId: string;
  try {
    userId = Buffer.from(encodedId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;

  return equalSignatures(sign(userId, version), signature) ? { userId, version } : null;
}

/** Возвращает id пользователя или null, если подпись не сходится (версию не сверяет). */
export function parseCalendarToken(token: string): string | null {
  return parseCalendarTokenVersioned(token)?.userId ?? null;
}

/**
 * Сверка подписей за постоянное время.
 *
 * Маршрут ленты открыт без сессии, и подпись — единственное, что
 * стоит между чужой ссылкой и чужим расписанием. Обычное сравнение
 * строк выходит из цикла на первом несовпавшем символе, то есть время
 * ответа зависит от того, сколько символов подписи угадано. Так же
 * сделано в lib/storage/signing.ts для ссылок на файлы: та же угроза,
 * и ответ на неё должен быть один.
 */
function equalSignatures(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  // Длины сравниваем отдельно: timingSafeEqual бросает на разной длине
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
