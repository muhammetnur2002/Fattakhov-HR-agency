import { join } from "node:path";

import type { FileStorage } from "./index";
import { LocalFileStorage } from "./local";
import { S3FileStorage, s3ConfigFromEnv } from "./s3";

/**
 * Единая точка получения хранилища.
 *
 * Локальный диск в разработке, S3 в проде. Выбор делается по наличию
 * настроек S3, а не по NODE_ENV: так режим можно проверить на своей
 * машине, подставив боевые ключи, не притворяясь продом.
 *
 * Но в проде без S3 приложение обязано не запуститься. Тихо свалиться
 * на локальный диск значит разложить резюме кандидатов по диску
 * сервера: они пропадут при первом перезапуске и всё это время будут
 * лежать не там, где требует закон (BR-32). Отказ на старте выглядит
 * страшно, но обходится дешевле, чем потерянные персональные данные.
 */
let instance: FileStorage | undefined;

export function getStorage(): FileStorage {
  if (instance) return instance;

  const s3 = s3ConfigFromEnv();

  if (s3) {
    instance = new S3FileStorage(s3);
    return instance;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "В проде хранилище файлов обязано быть российским S3 (BR-32), " +
        "а настройки S3_* не заданы. Задайте S3_ENDPOINT, S3_BUCKET, " +
        "S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY.",
    );
  }

  const root = process.env.FILE_STORAGE_PATH ?? join(process.cwd(), ".storage");
  instance = new LocalFileStorage(root);
  return instance;
}

/** Только для тестов: сбросить закешированное хранилище. */
export function resetStorageForTests(): void {
  instance = undefined;
}
