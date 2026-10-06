/**
 * «В сети» и «был(а) последний раз» — одна строка статуса человека.
 *
 * Чистая функция без обращения к часам и базе: время «сейчас» приходит
 * параметром, поэтому она проверяется юнит-тестами без подмены таймеров.
 * Формат одинаковый у CRM и студенческой платформы — менять оба места
 * сразу (platform-for-students/lib/presence.ts).
 *
 * Правила (по убыванию свежести):
 *   ≤ 2 мин            «В сети» (зелёная точка)
 *   < 60 мин           «был(а) 15 мин назад»
 *   сегодня            «был(а) сегодня в 21:40»
 *   вчера              «был(а) вчера в 21:40»
 *   в этом году        «был(а) 12 сент.»
 *   старше / никогда   «был(а) давно»
 *
 * «Сегодня», «вчера» и время — по Москве, а не по часам того, кто смотрит:
 * агентство и его клиенты живут в одном часовом поясе, и «сегодня в 21:40»
 * должно значить одно и то же на любом компьютере. Род не угадываем
 * по имени — «был(а)».
 *
 * Кому показывать, решает не эта функция, а сервер (lib/services/messages.ts:
 * presenceFor): у скрывшего статус владельца сюда не должно попадать
 * вообще ничего — даже «давно».
 */

/**
 * Показывается ли статус человека — с учётом роли.
 *
 * Скрыть «в сети» может только владелец агентства (OWNER): у него значение
 * из `User.showPresence` как сохранено. У всех остальных — сотрудников
 * агентства и клиентов — статус виден всегда, что бы ни лежало в базе
 * (раньше переключатель был у каждого, и у кого-то он мог остаться выключенным).
 * Единственное место, где записано это правило: и показ (presenceFor), и
 * запись пульса (lib/services/presence.ts) решаются по нему. Миграции данных
 * нет — значение считается кодом.
 */
export function effectiveShowPresence(user: { role: string; showPresence: boolean }): boolean {
  return user.role === "OWNER" ? user.showPresence : true;
}

/** Пока пульс свежее этого, человек «в сети»: пульс раз в минуту + запас на задержку. */
export const ONLINE_WINDOW_MS = 2 * 60_000;

const MINUTE_MS = 60_000;

/** Сокращения месяцев — свои, а не Intl: ICU разных версий пишет «сент.» и «сен.» по-разному. Как в ru-RU: «мая» без точки. */
const MONTHS_SHORT = [
  "янв.",
  "февр.",
  "мар.",
  "апр.",
  "мая",
  "июн.",
  "июл.",
  "авг.",
  "сент.",
  "окт.",
  "нояб.",
  "дек.",
] as const;

const MOSCOW = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

type MoscowClock = { year: number; month: number; day: number; hour: number; minute: number };

function moscowClock(date: Date): MoscowClock {
  const parts: Record<string, number> = {};
  for (const part of MOSCOW.formatToParts(date)) {
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

/** Номер календарного дня — чтобы «вчера» считалось и через границу месяца и года. */
function dayNumber(clock: MoscowClock): number {
  return Math.floor(Date.UTC(clock.year, clock.month - 1, clock.day) / 86_400_000);
}

export type PresenceLine = {
  /** Показывать зелёную точку. */
  online: boolean;
  /** Готовая строка: «В сети», «был(а) вчера в 21:40»… */
  text: string;
};

export type PresenceInput = Date | string | number | null | undefined;

function toDate(value: PresenceInput): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPresence(lastSeenAt: PresenceInput, now: Date): PresenceLine {
  const seen = toDate(lastSeenAt);
  if (!seen) return { online: false, text: "был(а) давно" };

  const diff = now.getTime() - seen.getTime();
  // Часы сервера и браузера расходятся: «из будущего» — значит только что
  if (diff <= ONLINE_WINDOW_MS) return { online: true, text: "В сети" };

  if (diff < 60 * MINUTE_MS) {
    return { online: false, text: `был(а) ${Math.floor(diff / MINUTE_MS)} мин назад` };
  }

  const then = moscowClock(seen);
  const today = moscowClock(now);
  const daysAgo = dayNumber(today) - dayNumber(then);
  const time = `${String(then.hour).padStart(2, "0")}:${String(then.minute).padStart(2, "0")}`;

  if (daysAgo === 0) return { online: false, text: `был(а) сегодня в ${time}` };
  if (daysAgo === 1) return { online: false, text: `был(а) вчера в ${time}` };
  if (then.year === today.year) {
    return { online: false, text: `был(а) ${then.day} ${MONTHS_SHORT[then.month - 1]}` };
  }
  return { online: false, text: "был(а) давно" };
}

/**
 * Статус человека для экрана. null — показывать нечего (владелец скрыл статус
 * или смотрящему не положено его видеть): строка не рисуется вовсе.
 * `lastSeenAt: null` внутри — «никогда не заходил после появления статуса»,
 * он честно даёт «был(а) давно».
 */
export type Presence = { lastSeenAt: Date | null };
