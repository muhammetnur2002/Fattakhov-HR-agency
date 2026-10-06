import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

/**
 * SMS: пока только коды для входа по номеру телефона.
 *
 * Отправляет Yandex Cloud Notification Service — облако то же, где
 * сервер, база и файлы (решение заказчика 24.09.2026: держать всё
 * в одном месте, а не заводить отдельный SMS-сервис). У него API,
 * совместимый с Amazon SNS, поэтому клиент — @aws-sdk/client-sns той же
 * версии, что уже стоит для хранилища (@aws-sdk/client-s3), и ключи того
 * же вида: статические ключи сервисного аккаунта, подпись AWS SigV4.
 *
 * Адрес и регион — из документации Yandex Cloud (инструкция для AWS CLI):
 * https://notifications.yandexcloud.net/, ru-central1; другой регион
 * даёт ошибку авторизации.
 *
 * Чего нет без поддержки Yandex Cloud: сервис включают по заявке,
 * сначала он работает в «песочнице» — только на заранее подтверждённые
 * тестовые номера. Отправлять всем — после регистрации имени отправителя
 * (2-4 недели, абонентская плата) и выхода из песочницы по обращению.
 *
 * Отличие от писем и ВК: ошибка отправки здесь БРОСАЕТСЯ. Там
 * недоставленное уведомление не должно ронять действие, а здесь SMS
 * и есть действие: сказать человеку «код отправлен», когда он не ушёл,
 * значит заставить его ждать то, чего не будет.
 */

export type SmsMessage = {
  /** E.164: +79001234567. */
  to: string;
  text: string;
};

export interface SmsTransport {
  send(message: SmsMessage): Promise<void>;
}

export class SmsSendError extends Error {}

/**
 * Разработка: код пишется в журнал. Только не в проде — там это значило
 * бы выложить коды входа любому, у кого есть доступ к журналу. В проде
 * без ключей вход по телефону просто не показывается (smsConfigured).
 */
class LoggingSmsTransport implements SmsTransport {
  async send(message: SmsMessage): Promise<void> {
    console.info(`[sms] → ${message.to}: ${message.text}`);
  }
}

class YandexCnsSmsTransport implements SmsTransport {
  private client: SNSClient;

  constructor(
    credentials: { accessKeyId: string; secretAccessKey: string },
    private readonly sender: string | null,
  ) {
    this.client = new SNSClient({
      region: "ru-central1",
      endpoint: "https://notifications.yandexcloud.net/",
      credentials,
    });
  }

  async send(message: SmsMessage): Promise<void> {
    try {
      await this.client.send(
        new PublishCommand({
          PhoneNumber: message.to,
          Message: message.text,
          // Имя отправителя — то, что зарегистрировано в Yandex Cloud.
          // Без него уходит от общего отправителя (песочница)
          ...(this.sender && {
            MessageAttributes: {
              "AWS.SNS.SMS.SenderID": {
                DataType: "String",
                StringValue: this.sender,
              },
            },
          }),
        }),
      );
    } catch (error) {
      // Подробности — в журнал, человеку — понятная фраза выше по стеку
      console.error(`[sms] не отправлено на ${message.to}`, error);
      throw new SmsSendError("SMS не отправилось");
    }
  }
}

function credentialsFromEnv(): { accessKeyId: string; secretAccessKey: string } | null {
  const accessKeyId = process.env.SMS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.SMS_SECRET_ACCESS_KEY?.trim();
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : null;
}

/**
 * Можно ли предлагать вход по телефону.
 *
 * В разработке — всегда: код виден в журнале, этого достаточно, чтобы
 * проверить путь целиком. В проде — только с ключами.
 */
export function smsConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || credentialsFromEnv() !== null;
}

let transport: SmsTransport | undefined;

export function getSmsTransport(): SmsTransport {
  if (!transport) {
    const credentials = credentialsFromEnv();
    if (credentials) {
      transport = new YandexCnsSmsTransport(
        credentials,
        process.env.SMS_SENDER?.trim() || null,
      );
    } else if (process.env.NODE_ENV === "production") {
      // Сюда не должны доходить: форма без ключей не показывается.
      // Но если дошли — отказ, а не код в журнал
      throw new SmsSendError("Вход по телефону не настроен");
    } else {
      transport = new LoggingSmsTransport();
    }
  }
  return transport;
}

/** Только для тестов. */
export function setSmsTransportForTests(t: SmsTransport | undefined): void {
  transport = t;
}
