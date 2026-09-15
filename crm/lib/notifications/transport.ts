/**
 * Каналы доставки уведомлений.
 *
 * Устроено как хранилище файлов: интерфейс отдельно от реализации.
 * В разработке письма и сообщения пишутся в лог — так весь движок
 * событий проверяется без почтового аккаунта и бота. Реальная отправка
 * включается переменными окружения, вызовы при этом не меняются.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Текстовая версия: для писем она обязательна, html — опционален. */
  text: string;
  html?: string;
};

export type TelegramMessage = {
  chatId: string;
  text: string;
  /** Ссылка на объект — Telegram показывает её кнопкой. */
  url?: string;
  urlLabel?: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export interface TelegramTransport {
  send(message: TelegramMessage): Promise<void>;
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

export class LoggingTelegramTransport implements TelegramTransport {
  async send(message: TelegramMessage): Promise<void> {
    console.info(
      `[telegram] → ${message.chatId}\n  ${message.text.replace(/\n/g, "\n  ")}` +
        (message.url ? `\n  ссылка: ${message.url}` : ""),
    );
  }
}

/**
 * Отправка через Telegram Bot API.
 *
 * Без внешних зависимостей: нужен один POST. Ошибки не бросаем —
 * упавшее уведомление не должно ронять действие, которое его вызвало.
 * Клиент не должен получать ошибку в ответ на «отказать кандидату»
 * только потому, что у рекрутера отвалился Telegram.
 */
export class BotApiTelegramTransport implements TelegramTransport {
  constructor(private readonly token: string) {}

  async send(message: TelegramMessage): Promise<void> {
    const text = message.url
      ? `${message.text}\n\n${message.urlLabel ?? "Открыть"}: ${message.url}`
      : message.text;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: message.chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
      );

      if (!response.ok) {
        console.error(
          `[telegram] не доставлено ${message.chatId}: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("[telegram] сбой отправки", error);
    }
  }
}
