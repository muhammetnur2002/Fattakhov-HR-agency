import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { maskEmail } from '@/lib/account-codes';
import { secureSmtpUrl } from './smtp-url';
import type { MailContent } from './templates';

export interface OutgoingMail extends MailContent {
  to: string;
  /** Куда уйдёт ответ получателя — например, обратно автору обращения в поддержку. */
  replyTo?: string;
}

interface SentMail extends OutgoingMail {
  sentAt: string;
}

const OUTBOX_LIMIT = 200;

// На globalThis: в разработке модуль перезагружается при каждой правке,
// а соединение с SMTP и журнал писем должны это переживать
const globalForMail = globalThis as unknown as { fhrMailer?: Transporter; fhrOutbox?: SentMail[] };

/** Настоящая отправка включена: заданы и сервер, и адрес отправителя. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim() && process.env.SMTP_FROM?.trim());
}

/**
 * Отправка письма.
 *
 * Никогда не бросает: недоставленное письмо не должно отменять действие,
 * которое его вызвало, — HR, подтвердивший учёбу, не должен получить ошибку
 * из-за недоступного почтового сервера. Сбой пишется в лог без полного
 * адреса получателя.
 *
 * Без SMTP в разработке письмо пишется в лог и в журнал процесса: так весь
 * путь с кодами и ссылками проверяется, ничего не отправив живым людям.
 * В production без SMTP приложение не стартует (instrumentation.ts).
 */
export async function sendMail(mail: OutgoingMail): Promise<boolean> {
  try {
    if (!mailConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        console.error(`[почта] SMTP_URL или SMTP_FROM не заданы — письмо для ${maskEmail(mail.to)} не отправлено`);
        return false;
      }
      remember(mail);
      console.info(`[письмо] → ${mail.to}\n  тема: ${mail.subject}\n  ${mail.text.replace(/\n/g, '\n  ')}`);
      return true;
    }

    globalForMail.fhrMailer ??= nodemailer.createTransport(secureSmtpUrl(process.env.SMTP_URL!.trim()));
    await globalForMail.fhrMailer.sendMail({
      from: process.env.SMTP_FROM!.trim(),
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (error) {
    console.error(`[почта] письмо для ${maskEmail(mail.to)} не доставлено: ${describeMailError(error)}`);
    return false;
  }
}

/**
 * Причина сбоя отправки для журнала — без объекта ошибки целиком. Ответ SMTP-сервера
 * ("550 <user@mail.ru>: Recipient address rejected") и поля ошибки nodemailer содержат адрес
 * получателя, а журнал контейнера — не место для адресов: адреса в тексте маскируются.
 */
export function describeMailError(error: unknown): string {
  const info = error as { code?: unknown; responseCode?: unknown; message?: unknown } | null;
  const parts = [info?.code, info?.responseCode, typeof info?.message === 'string' ? info.message : String(error)]
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map(String);
  return parts.join(' ').replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (address) => maskEmail(address)).slice(0, 300);
}

function remember(mail: OutgoingMail) {
  const outbox = (globalForMail.fhrOutbox ??= []);
  outbox.push({ ...mail, sentAt: new Date().toISOString() });
  if (outbox.length > OUTBOX_LIMIT) outbox.splice(0, outbox.length - OUTBOX_LIMIT);
}

/**
 * Журнал писем для разработки и сквозной проверки: код подтверждения и
 * ссылку сброса иначе не достать. Только без SMTP и не в production —
 * там писем в памяти нет вовсе.
 */
export function devOutboxAvailable(): boolean {
  return process.env.NODE_ENV !== 'production' && !mailConfigured();
}

export function devOutbox(email: string): SentMail[] {
  if (!devOutboxAvailable()) return [];
  const wanted = email.trim().toLowerCase();
  return (globalForMail.fhrOutbox ?? []).filter((m) => m.to.toLowerCase() === wanted);
}
