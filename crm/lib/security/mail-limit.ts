import { reserveAttempt, type ReserveResult } from "@/lib/security/db-limit";

/**
 * Лимит писем на адрес — для форм, где человек просит письмо на любой
 * названный адрес: код регистрации и ссылка восстановления.
 *
 * Лимит по IP (guardRate) от рассылки на чужой ящик не защищает: адрес
 * меняется за секунду, а ящик жертвы один. Поэтому считаем по адресу, и
 * в базе (db-limit.ts): память процесса обнулялась бы с перезапуском.
 *
 * Адрес берётся в нижнем регистре и без пробелов — иначе «A@x.ru» и
 * «a@x.ru» были бы двумя разными ящиками для счётчика.
 */

const HOUR_MS = 60 * 60_000;

const PRESETS = {
  /* Код регистрации: три в час и пауза минута между письмами. */
  register: { limit: 3, windowMs: HOUR_MS, minGapMs: 60_000 },
  /* Ссылка восстановления: три в час, пауза не нужна — письмо уходит на
     любой адрес, и экран отвечает одинаково (lib/services/passwords.ts). */
  reset: { limit: 3, windowMs: HOUR_MS },
} as const;

export type MailKind = keyof typeof PRESETS;

export function reserveMail(kind: MailKind, email: string): Promise<ReserveResult> {
  return reserveAttempt(`mail:${kind}:${email.trim().toLowerCase()}`, PRESETS[kind]);
}

/**
 * Текст отказа. Одинаков для любого адреса — занятого и свободного, —
 * и не называет точных секунд: по ним нельзя ничего вывести об адресе.
 */
export function mailLimitMessage(result: Extract<ReserveResult, { allowed: false }>): string {
  return result.reason === "gap"
    ? "Письмо с кодом уже отправлено. Подождите минуту и запросите ещё раз"
    : "На этот адрес отправлено слишком много писем. Попробуйте через час";
}

const DAY_MS = 24 * HOUR_MS;

/** Писем «чужим» адресам с одного IP в час, по каждой форме отдельно. */
const STRANGER_IP_LIMIT = 10;
/** Писем «чужим» адресам за сутки на всю систему, по каждой форме отдельно. */
const STRANGER_DAY_LIMIT = 150;

/**
 * Письмо на адрес, который мы не знаем: код регистрации и «учётной записи
 * нет». Лимит на адрес (reserveMail) защищает одного получателя, но не
 * домен: можно слать по трём письмам в час на каждый из тысячи ящиков и
 * загубить репутацию отправителя, а с ней и доставку приглашений.
 *
 * Поэтому добавлены два потолка: по IP и общий суточный. Общий нарочно
 * только на письма незнакомцам: письма настоящим сотрудникам (ссылка
 * сброса, приглашение) под него не попадают, и рассылкой по чужим адресам
 * их не заблокировать.
 */
export async function reserveStrangerMail(
  kind: MailKind,
  ip: string | null | undefined,
): Promise<boolean> {
  if (ip) {
    const byIp = await reserveAttempt(`mail:ip:${kind}:${ip}`, {
      limit: STRANGER_IP_LIMIT,
      windowMs: HOUR_MS,
    });
    if (!byIp.allowed) return false;
  }
  const total = await reserveAttempt(`mail:day:${kind}`, {
    limit: STRANGER_DAY_LIMIT,
    windowMs: DAY_MS,
  });
  return total.allowed;
}

/** Текст отказа общего потолка. Одинаков для любого адреса. */
export const STRANGER_MAIL_MESSAGE =
  "Сейчас письма с кодами отправляются с задержкой. Попробуйте позже или напишите нам";
