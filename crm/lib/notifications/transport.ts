/**
 * Каналы доставки уведомлений.
 *
 * Устроено как хранилище файлов: интерфейс отдельно от реализации.
 * В разработке письма и сообщения пишутся в лог — так весь движок
 * событий проверяется без почтового аккаунта и бота. Реальная отправка
 * включается переменными окружения, вызовы при этом не меняются.
 */

import { vkSendMessage } from "@/lib/notifications/vk-api";

export type EmailMessage = {
  to: string;
  subject: string;
  /** Текстовая версия: для писем она обязательна, html — опционален. */
  text: string;
  html?: string;
};

export type VkMessage = {
  /** Числовой id страницы ВКонтакте. */
  userId: string;
  text: string;
  /** Ссылка на объект — в ВК уходит последней строкой. */
  url?: string;
  urlLabel?: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export interface VkTransport {
  send(message: VkMessage): Promise<void>;
}

/**
 * Заглушка для разработки: пишет в консоль вместо отправки.
 *
 * Это не «пока не сделали», а рабочий режим: он позволяет прогнать
 * все события матрицы 9.2, ничего никому не отправив. Случайно
 * разослать письма реальным людям на тестовых данных — та ещё история.
 */
export class LoggingEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `[письмо] → ${message.to}\n  тема: ${message.subject}\n  ${message.text.replace(/\n/g, "\n  ")}`,
    );
  }
}

/**
 * Сообщения ВКонтакте от имени сообщества.
 *
 * Отказы не бросаются — как у почты: недоставленное сообщение
 * не должно ронять действие, ради которого его отправляли. Но и не
 * глотаются молча: ВК отвечает отказом с кодом 200, и без разбора тела
 * сбой выглядел бы успехом (см. lib/notifications/vk-api.ts).
 */
export class VkApiTransport implements VkTransport {
  constructor(private readonly token: string) {}

  async send(message: VkMessage): Promise<void> {
    const text = message.url
      ? `${message.text}\n\n${message.urlLabel ?? "Открыть"}: ${message.url}`
      : message.text;

    const result = await vkSendMessage(this.token, message.userId, text);
    if (!result.ok) {
      console.error(
        `[вк] не доставлено ${message.userId}: ${result.code ?? "—"} ${result.message}`,
      );
    }
  }
}

export class LoggingVkTransport implements VkTransport {
  async send(message: VkMessage): Promise<void> {
    console.info(`[вк] → ${message.userId}\n  ${message.text}`);
  }
}
