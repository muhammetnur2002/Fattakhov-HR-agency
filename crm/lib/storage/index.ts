/**
 * Хранилище файлов.
 *
 * Интерфейс отделён от реализации намеренно: в разработке файлы лежат
 * на диске, в проде обязаны лежать в российском S3 (BR-32 — локализация
 * ПДн). Подмена делается одной строкой в `getStorage()`, вызовы
 * в сервисах не меняются.
 *
 * Файлы никогда не отдаются прямой ссылкой: только через подписанный
 * URL с коротким сроком жизни (BR-37), иначе ссылка на резюме,
 * once попавшая в чужие руки, работает вечно.
 */

export type StoredFile = {
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export interface FileStorage {
  put(params: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Разрешённые типы файлов (BR-23). Проверяется по содержимому запроса, не по расширению. */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "image/jpeg",
  "image/png",
  "application/zip",
]);

/** Максимальный размер файла — 20 МБ (BR-23). */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export class FileValidationError extends Error {}

/**
 * Группы magic bytes для заявленных MIME-типов (BR-23).
 *
 * Content-Type из запроса ставит браузер по расширению — это отправитель
 * рассказывает о себе сам, а не факт. Заголовок легко подделать сырым
 * запросом, поэтому реальный тип проверяется по первым байтам файла.
 *
 * docx, odt и zip — один и тот же ZIP-контейнер на байтовом уровне;
 * различить их без разбора архива нельзя, но и не нужно: все три и так
 * в ALLOWED_MIME_TYPES, а сюда не пройдёт ничего, что не является
 * настоящим ZIP — HTML или исполняемый файл под чужим Content-Type.
 */
const SIGNATURES: { types: Set<string>; magic: Buffer }[] = [
  { types: new Set(["application/pdf"]), magic: Buffer.from("%PDF-") },
  {
    types: new Set(["application/msword"]),
    magic: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  {
    types: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/zip",
    ]),
    magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
  {
    types: new Set(["application/rtf", "text/rtf"]),
    magic: Buffer.from("{\\rtf"),
  },
  { types: new Set(["image/jpeg"]), magic: Buffer.from([0xff, 0xd8, 0xff]) },
  {
    types: new Set(["image/png"]),
    magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
];

function matchesSignature(body: Buffer, declaredType: string): boolean {
  const group = SIGNATURES.find((g) => g.types.has(declaredType));
  // Тип не из наших групп сюда не попадёт: до этой проверки его уже
  // отсеял ALLOWED_MIME_TYPES.
  if (!group) return false;
  return body.subarray(0, group.magic.length).equals(group.magic);
}

export function validateUpload(file: {
  size: number;
  type: string;
  body: Buffer;
}): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new FileValidationError("Файл больше 20 МБ");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new FileValidationError(
      "Такой тип файла не поддерживается. Поддерживаются pdf, doc, docx, rtf или odt",
    );
  }
  if (!matchesSignature(file.body, file.type)) {
    throw new FileValidationError(
      "Содержимое файла не похоже на заявленный тип. Проверьте файл и загрузите ещё раз",
    );
  }
}

/**
 * Ключ файла в хранилище.
 *
 * Случайный сегмент нужен, чтобы ключ нельзя было угадать по id
 * кандидата: даже при утечке подписи чужой файл не подберётся перебором.
 */
export function buildStorageKey(params: {
  organizationId: string;
  scope: string;
  scopeId: string;
  fileName: string;
}): string {
  const random = crypto.randomUUID();
  const ext = params.fileName.includes(".")
    ? params.fileName.slice(params.fileName.lastIndexOf("."))
    : "";
  return `${params.organizationId}/${params.scope}/${params.scopeId}/${random}${ext}`;
}
