import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_LIMITS, type UploadKind } from '@/lib/validation';
import { HttpError } from '@/lib/security/http-error';

/**
 * Хранилище загруженных файлов.
 *
 * Файлы кладутся вне `public/`: всё, что попадает в public, раздаётся
 * статикой по предсказуемому пути и индексируется. Резюме и фото —
 * персональные данные, они обязаны идти через роут, где можно спросить,
 * кто их запрашивает.
 *
 * Диск — только для локальной разработки. На Vercel (и любом другом
 * serverless-хостинге) файловая система либо только для чтения, либо
 * живёт не дольше одного вызова функции: записанный файл читается
 * только внутри того же запроса и пропадает бесследно при следующем —
 * ровно то, что раньше не давало загрузить резюме при регистрации.
 * Если заданы S3_* (тот же набор переменных, что и на сайте агентства),
 * файлы идут в S3-совместимое хранилище; без них — как раньше, на диск.
 */

/** Корень каталога загрузок. Считается при каждом обращении: проверки подставляют временный каталог. */
function uploadRoot(): string {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), '.uploads');
}

type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

/**
 * Настройки S3 из окружения. Пусто — работаем с диском (разработка).
 * Задано наполовину — громкая ошибка: молча свалиться на диск на
 * проде значит потерять файлы при первом же перезапуске сервера.
 */
function s3ConfigFromEnv(): S3Config | null {
  const fields = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  const set = Object.entries(fields).filter(([, v]) => Boolean(v));
  if (set.length === 0) return null;

  const missing = Object.entries(fields)
    .filter(([, v]) => !v)
    .map(([k]) => `S3_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(
      `Хранилище S3 настроено наполовину. Не заданы: ${missing.join(', ')}. ` +
        'Либо задайте все переменные, либо уберите все.',
    );
  }

  return {
    endpoint: fields.endpoint!,
    bucket: fields.bucket!,
    accessKeyId: fields.accessKeyId!,
    secretAccessKey: fields.secretAccessKey!,
    region: process.env.S3_REGION ?? 'ru-central1',
  };
}

/** Всё, что хранилищу нужно от S3-клиента: отправить команду. Поддельный клиент в проверках — тоже такой. */
type S3Sender = Pick<S3Client, 'send'>;

type S3Handle = {
  client: S3Sender;
  /** Клиент для подписи ссылок: без контрольной суммы пустого тела (см. presignUpload) */
  signer: S3Client | null;
  bucket: string;
};

let cachedClient: S3Handle | null | undefined;

/** undefined — ещё не проверяли, null — S3 не настроен (работаем с диском). */
function s3Client(): S3Handle | null {
  if (cachedClient !== undefined) return cachedClient;
  const config = s3ConfigFromEnv();
  if (!config) {
    cachedClient = null;
    return null;
  }
  const options = {
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Яндекс и большинство российских провайдеров работают по пути,
    // а не по поддомену бакета: без forcePathStyle запросы уходят в никуда
    forcePathStyle: true,
  };
  cachedClient = {
    bucket: config.bucket,
    client: new S3Client(options),
    // Новые версии SDK кладут в подписанную ссылку контрольную сумму CRC32 — и считают её от
    // пустого тела, потому что тела при подписи ещё нет. Строгое хранилище отклонило бы такую
    // загрузку. Для подписи просим суммы только там, где без них нельзя
    signer: new S3Client({ ...options, requestChecksumCalculation: 'WHEN_REQUIRED' }),
  };
  return cachedClient;
}

/** Только для проверок: подменить S3 поддельным, сбросить выбор хранилища. */
export const storageTestHooks = {
  useS3(client: { send: (command: never) => Promise<unknown> }, bucket: string) {
    cachedClient = { client: client as unknown as S3Sender, signer: null, bucket };
  },
  reset() {
    cachedClient = undefined;
  },
};

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * Тип из заголовка запроса задаёт сам отправитель, поэтому смотрим ещё и на первые байты:
 * иначе под видом картинки можно сложить на сервер что угодно.
 */
function matchesMagic(mime: string, head: Buffer): boolean {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (mime) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case 'image/webp':
      return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'application/pdf':
      return head.subarray(0, 1024).toString('latin1').includes('%PDF-');
    case 'application/msword':
      return startsWith(0xd0, 0xcf, 0x11, 0xe0);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(0x50, 0x4b);
    case 'video/mp4':
      return head.subarray(4, 8).toString('latin1') === 'ftyp';
    case 'video/webm':
      return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    default:
      return false;
  }
}

export interface StoredFile {
  /** Путь для клиента: /api/files/<kind>/<name> */
  url: string;
  name: string;
  size: number;
}

export async function storeUpload(kind: UploadKind, file: File): Promise<StoredFile> {
  const limits = UPLOAD_LIMITS[kind];

  if (!(limits.mime as readonly string[]).includes(file.type)) {
    throw new HttpError(415, `Неподходящий формат. Нужен ${limits.label}`, 'BAD_MIME');
  }
  if (file.size > limits.maxBytes) {
    throw new HttpError(413, `Файл слишком большой. Нужен ${limits.label}`, 'TOO_LARGE');
  }
  if (file.size === 0) {
    throw new HttpError(400, 'Файл пустой', 'EMPTY_FILE');
  }

  // Имя генерируем сами: исходное имя файла — это ввод пользователя,
  // и в нём может быть и обход каталога, и что угодно ещё.
  const stored = `${randomUUID()}.${EXTENSION[file.type] ?? 'bin'}`;
  const body = Buffer.from(await file.arrayBuffer());
  if (!matchesMagic(file.type, body)) {
    throw new HttpError(415, `Содержимое не похоже на заявленный формат. Нужен ${limits.label}`, 'BAD_CONTENT');
  }

  const s3 = s3Client();
  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: `${kind}/${stored}`,
        Body: body,
        ContentType: file.type,
      }),
    );
  } else {
    const dir = path.join(uploadRoot(), kind);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, stored), body);
  }

  return {
    url: `/api/files/${kind}/${stored}`,
    name: sanitizeDisplayName(file.name),
    size: file.size,
  };
}

/**
 * Прямая загрузка в S3 по подписанной ссылке — для видео.
 *
 * Функции на Vercel режут тело запроса на 4.5 МБ: видео до 50 МБ через
 * `storeUpload()` (обычный POST на наш сервер) попросту не доедет. Клиент
 * поэтому льёт файл сразу в S3 по ссылке с подписью, минуя наш сервер;
 * здесь только выдаём эту ссылку и заранее знаем итоговый публичный адрес.
 * Без S3 (разработка) прямой загрузки нет — используется storeUpload().
 *
 * В подпись входят Content-Length и Content-Type: хранилище примет ровно столько байт,
 * сколько заявлено (а заявленное не больше лимита вида), и только с этим типом. Тот, кто
 * заявил 1 МБ, а отправил 5 ГБ, получит отказ по подписи. Содержимое по подписи проверить
 * нельзя — его смотрит verifyUploadedVideo() при сохранении ссылки в профиль, а то, что так
 * и не сохранили, подбирает ночная уборка (lib/stored-files.ts).
 */
export async function presignUpload(
  kind: UploadKind,
  mimeType: string,
  size: number,
): Promise<{ uploadUrl: string; url: string } | null> {
  const s3 = s3Client();
  if (!s3) return null;

  const limits = UPLOAD_LIMITS[kind];
  if (!(limits.mime as readonly string[]).includes(mimeType)) {
    throw new HttpError(415, `Неподходящий формат. Нужен ${limits.label}`, 'BAD_MIME');
  }
  if (!Number.isInteger(size) || size <= 0 || size > limits.maxBytes) {
    throw new HttpError(413, `Файл слишком большой. Нужен ${limits.label}`, 'TOO_LARGE');
  }
  if (!s3.signer) throw new Error('Подпись ссылок недоступна: клиент S3 подменён');

  const ext = EXTENSION[mimeType] ?? 'bin';
  const stored = `${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3.signer,
    new PutObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${stored}`, ContentType: mimeType, ContentLength: size }),
    { expiresIn: 300, signableHeaders: new Set(['content-length', 'content-type']) },
  );

  return { uploadUrl, url: `/api/files/${kind}/${stored}` };
}

const VIDEO_URL = /^\/api\/files\/(studentVideo|companyVideo)\/([0-9a-f-]{36}\.(mp4|webm))$/i;
/** Сколько читаем с начала видео, чтобы узнать формат: заголовок контейнера занимает считанные байты. */
const VIDEO_HEAD_BYTES = 32 * 1024;

/**
 * Проверка видео, загруженного прямо в S3: размер объекта и первые байты.
 *
 * Подписанная ссылка не видит содержимого, поэтому файл может оказаться чем угодно под видом
 * mp4. Вызывается при сохранении ссылки на видео в профиль или страницу компании. Внешняя
 * ссылка (YouTube и т. п.) и любой другой вид файла не проверяются — это не наше хранилище.
 * Не прошёл — объект удаляется и сохранение отклоняется.
 */
export async function verifyUploadedVideo(url: string | null | undefined): Promise<void> {
  const match = url ? VIDEO_URL.exec(url) : null;
  if (!match) return;
  const [, kind, name, ext] = match;
  const mime = ext.toLowerCase() === 'mp4' ? 'video/mp4' : 'video/webm';
  const limits = UPLOAD_LIMITS[kind as UploadKind];
  const reject = async (message: string): Promise<never> => {
    await deleteStored(url!).catch(() => undefined);
    throw new HttpError(400, message, 'BAD_VIDEO');
  };

  let size: number;
  let head: Buffer;
  const s3 = s3Client();
  try {
    if (s3) {
      const meta = await s3.client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}` }));
      size = meta.ContentLength ?? 0;
      if (size > 0 && size <= limits.maxBytes) {
        const part = await s3.client.send(
          new GetObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}`, Range: `bytes=0-${VIDEO_HEAD_BYTES - 1}` }),
        );
        head = Buffer.from(part.Body ? await part.Body.transformToByteArray() : []);
      } else {
        head = Buffer.alloc(0);
      }
    } else {
      const full = path.join(uploadRoot(), kind, name);
      size = (await stat(full)).size;
      head = Buffer.alloc(0);
      if (size > 0 && size <= limits.maxBytes) {
        const file = await open(full, 'r');
        try {
          const buffer = Buffer.alloc(Math.min(size, VIDEO_HEAD_BYTES));
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          head = buffer.subarray(0, bytesRead);
        } finally {
          await file.close();
        }
      }
    }
  } catch (error) {
    const info = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
    const missing =
      info.name === 'NotFound' || info.name === 'NoSuchKey' || info.code === 'ENOENT' || info.$metadata?.httpStatusCode === 404;
    if (missing) throw new HttpError(400, 'Видео не найдено в хранилище — загрузите его заново', 'BAD_VIDEO');
    throw new HttpError(502, 'Не удалось проверить видео, повторите попытку', 'VIDEO_CHECK_FAILED');
  }

  if (size <= 0) return reject('Файл видео пустой — загрузите его заново');
  if (size > limits.maxBytes) return reject(`Видео слишком большое. Нужен ${limits.label}`);
  if (!matchesMagic(mime, head)) return reject(`Содержимое не похоже на видео. Нужен ${limits.label}`);
}

/** Сохраняется ссылка на видео: проверить файл, если она новая (прежнюю уже проверяли при сохранении). */
export async function verifyVideoIfChanged(next: string | null | undefined, previous: string | null | undefined): Promise<void> {
  if (next && next !== previous) await verifyUploadedVideo(next);
}

export interface StoredObject {
  kind: string;
  name: string;
  modifiedAt: Date;
  size: number;
}

/** Не больше стольких страниц листинга за вызов: защита от бесконечного цикла при сбое продолжения. */
const MAX_LIST_PAGES = 5000;

/**
 * Перечень загруженных файлов указанных видов — для ночной уборки сирот (lib/stored-files.ts).
 * Берутся только файлы с нашими именами `<uuid>.<расширение>` прямо в каталоге вида: всё
 * остальное в бакете — не наше и сюда не попадает.
 */
export async function listStoredFiles(kinds: readonly string[]): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  const s3 = s3Client();
  for (const kind of kinds) {
    if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind)) continue;
    if (s3) {
      let token: string | undefined;
      for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const result = await s3.client.send(
          new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: `${kind}/`, ContinuationToken: token }),
        );
        for (const item of result.Contents ?? []) {
          const name = item.Key?.slice(kind.length + 1) ?? '';
          if (!NAME_PATTERN.test(name) || !item.LastModified) continue;
          out.push({ kind, name, modifiedAt: item.LastModified, size: item.Size ?? 0 });
        }
        if (!result.IsTruncated || !result.NextContinuationToken) break;
        token = result.NextContinuationToken;
      }
      continue;
    }
    const dir = path.join(uploadRoot(), kind);
    const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [] as string[];
      throw error;
    });
    for (const name of names) {
      if (!NAME_PATTERN.test(name)) continue;
      const info = await stat(path.join(dir, name)).catch(() => null);
      if (info?.isFile()) out.push({ kind, name, modifiedAt: info.mtime, size: info.size });
    }
  }
  return out;
}

const NAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

function typeFromName(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return Object.entries(EXTENSION).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
}

export async function readStored(kind: string, name: string): Promise<{ body: Buffer; type: string }> {
  // Оба сегмента сверяются с белым списком, а не «очищаются»: обход каталога
  // должен быть невозможен по построению, а не по фильтру.
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind) || !NAME_PATTERN.test(name)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  const s3 = s3Client();
  if (s3) {
    try {
      const result = await s3.client.send(
        new GetObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}` }),
      );
      if (!result.Body) throw new Error('empty body');
      const bytes = await result.Body.transformToByteArray();
      return { body: Buffer.from(bytes), type: typeFromName(name) };
    } catch {
      throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
    }
  }

  const root = uploadRoot();
  const full = path.join(root, kind, name);
  if (!full.startsWith(root + path.sep)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  try {
    const body = await readFile(full);
    return { body, type: typeFromName(name) };
  } catch {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }
}

/**
 * Имя файла показывается студенту, работодателю и админу. Список
 * разрешённого, а не запрещённого: так в подпись не просочится ни
 * разметка, ни управляющие символы, ни RTL-override, которым маскируют
 * расширение.
 */
function sanitizeDisplayName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim();
  return cleaned.slice(0, 120) || 'Файл';
}

/**
 * Удалить загруженный файл по его адресу. Отсутствующий файл — не ошибка:
 * результат тот же, что и просили. Путь сверяется с тем же белым списком,
 * что и при чтении, — удалить что-то вне каталога загрузок нельзя.
 */
export async function deleteStored(url: string): Promise<void> {
  const match = /^\/api\/files\/([A-Za-z]+)\/([^/]+)$/.exec(url);
  if (!match) return;
  const [, kind, name] = match;
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind) || !NAME_PATTERN.test(name)) return;

  const s3 = s3Client();
  if (s3) {
    await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}` }));
    return;
  }

  const root = uploadRoot();
  const full = path.join(root, kind, name);
  if (!full.startsWith(root + path.sep)) return;
  await unlink(full).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
