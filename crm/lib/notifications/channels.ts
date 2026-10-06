import { createTransport, type Transporter } from "nodemailer";

import { isDeliverableEmail } from "./deliverable";
import {
  LoggingEmailTransport,
  LoggingVkTransport,
  VkApiTransport,
  type EmailMessage,
  type EmailTransport,
  type VkTransport,
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
    // Последний рубеж для заглушек быстрой регистрации (…@users.invalid):
    // рассылка их уже отсеивает, но приглашения и сброс пароля идут мимо неё
    if (!isDeliverableEmail(message.to)) return;
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
      await reportMailFailure(message.to, error);
    }
  }
}

/**
 * Почтовый сервер не принял письмо — сигнал владельцу (пуш, ВК,
 * письмо на ящик сбоев).
 *
 * Раньше отказ оставался только в журнале контейнера: письмо — ссылка
 * сброса пароля, приглашение — пропадало молча, и узнавали об этом от
 * человека, который его не дождался. Действие по-прежнему не падает:
 * reportFailure не бросает, повтор того же сбоя глушится на 15 минут.
 *
 * Письмо на сам ящик сбоев отсюда не сообщается: его отказ — это и есть
 * сообщение о сбое, и сообщать о нём было бы некуда, кроме журнала.
 * Импорт динамический: модуль сигналов сам шлёт почту через этот файл,
 * и статический импорт замкнул бы их друг на друга.
 */
async function reportMailFailure(to: string, error: unknown): Promise<void> {
  if (to === process.env.ALERT_EMAIL?.trim()) return;
  try {
    const { reportFailure } = await import("@/lib/monitoring/alerts");
    await reportFailure({ where: "почта", error });
  } catch (reportError) {
    console.error("[письмо] не удалось сообщить об отказе почты", reportError);
  }
}

let email: EmailTransport | undefined;
let vk: VkTransport | undefined;

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
 * Канал ВКонтакте. Без VK_BOT_TOKEN сообщения идут в лог.
 *
 * Отказа на старте здесь нет, и это не недосмотр: ВК — канал по желанию,
 * человек сам привязывает страницу в настройках, и пустой токен означает
 * «этой возможности у нас нет», а не потерянное письмо. Настроенность
 * обоих каналов видно в настройках (channelStatus).
 */
export function getVkTransport(): VkTransport {
  if (!vk) {
    const token = process.env.VK_BOT_TOKEN?.trim();
    vk = token ? new VkApiTransport(token) : new LoggingVkTransport();
  }
  return vk;
}

/** Настроены ли реальные каналы — показываем в настройках, чтобы не гадать. */
export function channelStatus() {
  return {
    email: Boolean(process.env.SMTP_URL && process.env.SMTP_FROM),
    vk: Boolean(process.env.VK_BOT_TOKEN?.trim()),
  };
}

/**
 * Номер сообщества агентства во ВКонтакте — без «-» и «club».
 * Один источник для обеих ссылок ниже.
 */
function vkGroupId(): string | null {
  const id = process.env.VK_GROUP_ID?.trim().replace(/^-/, "");
  return id || null;
}

/** Страница сообщества агентства во ВКонтакте. */
export function vkGroupUrl(): string | null {
  const id = vkGroupId();
  return id ? `https://vk.com/club${id}` : null;
}

/**
 * Личные сообщения с сообществом — сразу переписка, а не страница сообщества.
 *
 * Человек, которому надо отправить код боту, не должен сам искать на странице
 * кнопку «Написать сообщение» и гадать, что нажимать: ссылка vk.me открывает
 * чат с сообществом (в приложении ВК на телефоне — тоже). Пишет в него
 * человек первым, и именно это разрешает сообществу отвечать (код 901).
 */
export function vkMessageUrl(): string | null {
  const id = vkGroupId();
  return id ? `https://vk.me/club${id}` : null;
}
