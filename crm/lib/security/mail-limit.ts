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
