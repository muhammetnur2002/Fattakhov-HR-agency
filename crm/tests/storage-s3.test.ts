/**
 * Выбор хранилища и его настройка.
 *
 * Проверяется не работа с S3 (для этого нужен живой бакет), а то,
 * из-за чего файлы могут молча оказаться не там: полунастроенное
 * окружение и прод без S3. Обе ошибки тихие по своей природе -
 * приложение продолжает работать, а резюме ложатся на диск сервера
 * и пропадают при первом перезапуске.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getStorage, resetStorageForTests } from "@/lib/storage/client";
import { s3ConfigFromEnv } from "@/lib/storage/s3";

/**
 * NODE_ENV объявлен в типах только для чтения, но в тесте его надо
 * подменить: проверяется именно поведение в проде. Присваивание идёт
 * через обход типа, а не через ослабление типов на весь файл.
 */
function задатьРежим(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const КЛЮЧИ = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "NODE_ENV",
] as const;

let сохранённые: Record<string, string | undefined>;

beforeEach(() => {
  сохранённые = Object.fromEntries(КЛЮЧИ.map((k) => [k, process.env[k]]));
  for (const k of КЛЮЧИ) delete (process.env as Record<string, unknown>)[k];
  resetStorageForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(сохранённые)) {
    if (k === "NODE_ENV") задатьРежим(v);
    else if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetStorageForTests();
});

function задатьВсе() {
  process.env.S3_ENDPOINT = "https://storage.yandexcloud.net";
  process.env.S3_BUCKET = "fhr-files";
  process.env.S3_ACCESS_KEY_ID = "ключ";
  process.env.S3_SECRET_ACCESS_KEY = "секрет";
}

describe("настройки S3 из окружения", () => {
  it("без переменных возвращает null: это нормальная разработка", () => {
    expect(s3ConfigFromEnv()).toBeNull();
  });

  it("собирает настройки, когда заданы все", () => {
    задатьВсе();
    const c = s3ConfigFromEnv();
    expect(c?.bucket).toBe("fhr-files");
    expect(c?.endpoint).toBe("https://storage.yandexcloud.net");
  });

  it("падает громко, если настроено наполовину", () => {
    // Самая опасная ошибка: приложение бы продолжило работать
    // и сложило резюме на диск сервера
    process.env.S3_ENDPOINT = "https://storage.yandexcloud.net";
    process.env.S3_BUCKET = "fhr-files";
    expect(() => s3ConfigFromEnv()).toThrow(/наполовину/);
  });

  it("называет в ошибке, чего именно не хватает", () => {
    задатьВсе();
    delete process.env.S3_SECRET_ACCESS_KEY;
    expect(() => s3ConfigFromEnv()).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("регион по умолчанию российский", () => {
    задатьВсе();
    expect(s3ConfigFromEnv()?.region).toBe("ru-central1");
  });

  it("регион можно переопределить", () => {
    задатьВсе();
    process.env.S3_REGION = "ru-central-1a";
    expect(s3ConfigFromEnv()?.region).toBe("ru-central-1a");
  });
});

describe("выбор хранилища", () => {
  it("в разработке без S3 берёт локальный диск", () => {
    expect(getStorage().constructor.name).toBe("LocalFileStorage");
  });

  it("с настройками S3 берёт S3 даже вне прода", () => {
    // Чтобы боевые ключи можно было проверить у себя, не притворяясь продом
    задатьВсе();
    expect(getStorage().constructor.name).toBe("S3FileStorage");
  });

  it("в проде без S3 не запускается вовсе", () => {
    // Тихо свалиться на локальный диск в проде значит потерять
    // персональные данные и нарушить BR-32
    задатьРежим("production");
    expect(() => getStorage()).toThrow(/S3/);
  });

  it("в проде с настроенным S3 запускается", () => {
    задатьРежим("production");
    задатьВсе();
    expect(getStorage().constructor.name).toBe("S3FileStorage");
  });
});
