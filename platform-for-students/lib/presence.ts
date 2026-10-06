/**
 * «В сети» и «был(а) последний раз».
 *
 * Один формат на платформу и на CRM: человек видит одну и ту же строку в
 * обоих местах, и спорить о том, где «правильнее», не приходится.
 *
 * Время всегда московское. Сервер может стоять в любой зоне, а «сегодня в
 * 21:40» без привязки к зоне — это не время, а случайное число: студент в
 * Казани и рекрутер в Москве увидели бы разное.
 *
 * Род не угадывается по имени: «был(а)». Имя в базе зашифровано, а
 * определять пол по окончанию — способ ошибиться на каждом втором
 * нерусском имени и на половине фамилий.
 */

const MOSCOW = 'Europe/Moscow';

/** Порог «в сети». Пульс приходит раз в минуту, поэтому две минуты — это один пропуск. */
const ONLINE_MINUTES = 2;

export interface Presence {
  /** Зелёная точка рядом со строкой */
  online: boolean;
  text: string;
}

/** Календарная дата в Москве, в виде `2026-10-04` — для сравнения дней. */
function moscowDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function moscowTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function moscowDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function moscowYear(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MOSCOW, year: 'numeric' }).format(date);
}

/**
 * Строка о последнем появлении.
 *
 * `null` — человек не появлялся ни разу; это даёт «был(а) давно».
 * Отдельного «недавно» нет намеренно: слишком расплывчатая формулировка
 * ничего не говорит, а точная — это уже сама строка статуса.
 */
export function formatPresence(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
): Presence {
  if (!lastSeenAt) return { online: false, text: 'был(а) давно' };

  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return { online: false, text: 'был(а) давно' };

  // Часы на сервере и на устройстве расходятся: отметка «из будущего» —
  // это рассинхрон, а не машина времени. Считаем такого человека в сети.
  const minutes = Math.floor((now.getTime() - seen.getTime()) / 60_000);
  if (minutes <= ONLINE_MINUTES) return { online: true, text: 'В сети' };

  if (minutes < 60) return { online: false, text: `был(а) ${minutes} мин назад` };

  const today = moscowDay(now);
  const seenDay = moscowDay(seen);
  if (seenDay === today) return { online: false, text: `был(а) сегодня в ${moscowTime(seen)}` };

  const yesterday = moscowDay(new Date(now.getTime() - 86_400_000));
  if (seenDay === yesterday) return { online: false, text: `был(а) вчера в ${moscowTime(seen)}` };

  if (moscowYear(seen) === moscowYear(now)) {
    return { online: false, text: `был(а) ${moscowDayMonth(seen)}` };
  }

  return { online: false, text: 'был(а) давно' };
}

/**
 * Показывается ли статус человека.
 *
 * Всегда: скрыть «в сети» на платформе не могут ни студент, ни работодатель
 * (скрыть статус вправе только владелец агентства в CRM, а он на платформе
 * не собеседник). Поле `Account.showPresence` осталось в базе, но не читается:
 * сохранённое когда-то «выключено» ничего не значит. Единственное место, где
 * записано это правило, — и показ (visibleLastSeen), и пульс (lib/presence-pulse.ts)
 * живут без проверки поля. Миграции данных нет.
 */
export function effectiveShowPresence(_account?: { showPresence?: boolean } | null): boolean {
  return true;
}

/**
 * Что отдавать наружу.
 *
 * Статус виден всегда (effectiveShowPresence); `null` — только если
 * смотрящему не положено его видеть или человек ещё ни разу не появлялся.
 */
export function visibleLastSeen(
  /** `showPresence` принимается ради старых вызовов и игнорируется. */
  account: { lastSeenAt?: Date | null; showPresence?: boolean },
  canSee: boolean,
): Date | null {
  if (!canSee) return null;
  if (!effectiveShowPresence(account)) return null;
  return account.lastSeenAt ?? null;
}

/**
 * Пора ли записывать новую отметку.
 *
 * Пульс приходит с каждой открытой вкладки раз в минуту. Без этой
 * проверки десять вкладок давали бы десять записей в базу в минуту на
 * одного человека — при том, что показывается всё равно минутная
 * точность.
 */
export const PRESENCE_WRITE_INTERVAL_MS = 60_000;

/**
 * Как часто строка «в сети» пересчитывается в открытой вкладке. Чаще, чем
 * пульс (раз в минуту), нет смысла, реже — «был(а) 3 мин назад» запаздывает
 * больше чем на полминуты. Своё время у браузера свободное, поэтому «сейчас»
 * для строки округляется вниз до этого шага: перерисовка раз в шаг, а не
 * на каждый кадр.
 */
export const PRESENCE_TICK_MS = 30_000;

/** «Сейчас» для строки о последнем появлении — по шагу PRESENCE_TICK_MS. */
export function presenceNow(nowMs: number = Date.now()): Date {
  return new Date(Math.floor(nowMs / PRESENCE_TICK_MS) * PRESENCE_TICK_MS);
}

export function shouldWritePresence(
  previous: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!previous) return true;
  return now.getTime() - previous.getTime() >= PRESENCE_WRITE_INTERVAL_MS;
}
