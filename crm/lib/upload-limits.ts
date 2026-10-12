/**
 * Предел размера файла (BR-23) — чистый модуль, без хранилища: его читают и сервер,
 * и клиентские поля загрузки.
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Предел всего запроса с файлом: сам файл плюс служебные поля формы. Next режет тело
 * серверного действия раньше, чем файл доходит до нашей проверки, и страница падает
 * без причины — поэтому этот предел обязан быть не меньше MAX_FILE_SIZE.
 */
export const MAX_REQUEST_SIZE_MB = 21;

export const FILE_TOO_BIG_MESSAGE = "Файл больше 20 МБ — сожмите скан или выберите файл поменьше";

/** Сообщение для поля, если файл не пройдёт; пустая строка — файл подходит. */
export function oversizeMessage(file: { size: number } | null | undefined): string {
  return file && file.size > MAX_FILE_SIZE ? FILE_TOO_BIG_MESSAGE : "";
}

/** Размер файла для подписи у поля: «340 КБ», «1,2 МБ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00A0Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}\u00A0КБ`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")}\u00A0МБ`;
}
