import { createTransport, type Transporter } from "nodemailer";

import {
  BotApiTelegramTransport,
  LoggingEmailTransport,
  LoggingTelegramTransport,
  type EmailMessage,
  type EmailTransport,
  type TelegramTransport,
} from "./transport";

/**
 * Отправка писем по SMTP.
 *
 * Ошибки не бросаем: недоставленное письмо не должно ронять действие,
 * которое его вызвало. Рекрутер не должен получать ошибку в ответ
 * на «представить кандидата» из-за недоступного почтового сервера.
 */
class SmtpEmailTransport implements EmailTransport {
  private transporter: Transporter;

  constructor(url: string, private readonly from: string) {
    this.transporter = createTransport(url);
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      console.error(`[письмо] не доставлено ${message.to}`, error);
    }
  }
}

let email: EmailTransport | undefined;
let telegram: TelegramTransport | undefined;

/**
 * Канал почты. Без SMTP_URL письма пишутся в лог — это рабочий режим
 * разработки, а не заглушка: он позволяет прогнать все события,
 * не рассылая ничего живым людям на тестовых данных.
 *
 * В проде такой режим недопустим, и приложение с ним не поднимется —
 * ровно как с ненастроенным S3 (см. lib/storage/client.ts). Причина
 * та же и даже острее: почтой уходят приглашения и ссылки сброса
 * пароля. Без SMTP они не потеряются молча, а лягут в лог контейнера,
 * то есть одновременно перестанут работать и окажутся не там, где
 * персональным данным место. Заметить это некому: отправка ошибок
 * не бросает намеренно, чтобы недоставленное письмо не роняло
 * действие, которое его вызвало.
 */
export function getEmailTransport(): EmailTransport {
  if (!email) {
    const url = process.env.SMTP_URL;
    const from = process.env.SMTP_FROM;

    if (!url || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "В проде почта обязана уходить через SMTP: приглашения и ссылки " +
            "сброса пароля нельзя писать в лог. Задайте SMTP_URL и SMTP_FROM.",
        );
      }
      email = new LoggingEmailTransport();
      return email;
    }

    email = new SmtpEmailTransport(url, from);
  }
  return email;
}

/**
 * Канал Telegram. Без TELEGRAM_BOT_TOKEN сообщения идут в лог.
 *
 * Отказа на старте здесь нет, и это не недосмотр: Telegram — канал
 * по желанию, человек сам вписывает свой чат в настройках, и пустой
 * токен означает «этой возможности у нас нет», а не потерянное письмо.
 * Настроенность обоих каналов видно в настройках (channelStatus).
 */
export function getTelegramTransport(): TelegramTransport {
  if (!telegram) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    telegram = token
      ? new BotApiTelegramTransport(token)
      : new LoggingTelegramTransport();
  }
  return telegram;
}

/** Настроены ли реальные каналы — показываем в настройках, чтобы не гадать. */
export function channelStatus() {
  return {
    email: Boolean(process.env.SMTP_URL && process.env.SMTP_FROM),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  };
}
