import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { FileStorage } from "./index";

/**
 * S3-совместимое хранилище (BR-32).
 *
 * Российское по требованию закона: резюме и согласия кандидатов это
 * персональные данные, и лежать они обязаны на территории России.
 * Реализация не завязана на Яндекс: протокол S3 общий, и при смене
 * провайдера меняются только переменные окружения.
 *
 * Ключи доступа берутся из окружения и никогда не попадают в код
 * и в git. Проверка их наличия сделана громкой и на старте: тихо
 * упасть в локальное хранилище на проде значит разложить резюме
 * по диску сервера и потерять их при первом же перезапуске.
 */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Яндекс и большинство российских провайдеров работают по пути,
      // а не по поддомену бакета: без этого запросы уходят в никуда
      forcePathStyle: true,
    });
  }

  async put({
    key,
    body,
    mimeType,
  }: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!result.Body) {
      throw new Error(`Файл ${key} пуст или недоступен`);
    }

    // Сохраняем в память целиком: файлы ограничены 20 МБ (BR-23),
    // и отдаём мы их через свой обработчик, а не потоком наружу
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      // Отсутствие файла это не сбой: 404 и 403 на HEAD означают
      // «такого объекта нет», всё остальное - настоящая поломка,
      // и молчать о ней нельзя
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404 || status === 403) return false;
      throw error;
    }
  }
}

/**
 * Собрать настройки из окружения.
 *
 * Возвращает null, если S3 не настроен вовсе - это нормальный режим
 * разработки. Но если задана хотя бы одна переменная, а остальных
 * нет, это ошибка настройки, и она обязана быть громкой: полунастро-
 * енное хранилище тихо свалится в локальное, и файлы окажутся не там,
 * где должны, причём выяснится это через месяц.
 */
export function s3ConfigFromEnv(): S3Config | null {
  const поля = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  const заданные = Object.entries(поля).filter(([, v]) => Boolean(v));
  if (заданные.length === 0) return null;

  const пропущены = Object.entries(поля)
    .filter(([, v]) => !v)
    .map(([k]) => `S3_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);

  if (пропущены.length > 0) {
    throw new Error(
      `Хранилище S3 настроено наполовину. Не заданы: ${пропущены.join(", ")}. ` +
        "Либо задайте все переменные, либо уберите все: иначе файлы лягут " +
        "на диск сервера вместо S3.",
    );
  }

  return {
    endpoint: поля.endpoint!,
    bucket: поля.bucket!,
    accessKeyId: поля.accessKeyId!,
    secretAccessKey: поля.secretAccessKey!,
    region: process.env.S3_REGION ?? "ru-central1",
  };
}
