import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

import type { FileStorage } from "./index";

/**
 * Локальное хранилище для разработки.
 *
 * Каталог лежит вне репозитория и в .gitignore: резюме — персональные
 * данные, им нечего делать в истории git даже в тестовом виде.
 *
 * В прод не годится: там нужен российский S3 (BR-32).
 */
export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolveKey(key: string): string {
    // Ключ приходит из БД, но выход за пределы каталога надо исключить
    // на всякий случай: `../` в ключе иначе даст чтение любого файла
    const full = resolve(join(this.root, normalize(key)));
    if (!full.startsWith(resolve(this.root))) {
      throw new Error("Недопустимый ключ файла");
    }
    return full;
  }

  async put({
    key,
    body,
  }: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveKey(key);
    if (existsSync(path)) await unlink(path);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolveKey(key));
  }
}
