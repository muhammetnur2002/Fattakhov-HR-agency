import 'server-only';
import { deleteStored, listStoredFiles } from '@/lib/storage';
import type { DataStore, StudentRecord } from '@/lib/db/types';

/**
 * Загруженные файлы студентов: уборка при замене и ночная уборка сирот.
 *
 * Файл попадает в хранилище раньше, чем ссылка на него — в профиль, справку или регистрацию.
 * Фото и резюме можно приложить и без входа (шаги мастера), видео льётся прямо в S3.
 * Поэтому у файла бывает три судьбы: ссылку сохранили (файл нужен), ссылку заменили
 * (прежний файл больше не нужен) или так и не сохранили (сирота). Для двух последних здесь
 * есть уборка. Удаление необратимо — на S3 его смягчает 30-дневное версионирование бакета,
 * но полагаться только на него нельзя, поэтому правила уборки осторожные.
 */

/** Виды файлов, которые убирает уборка: только студенческие. Файлы компаний раздаются публично и живут по другим правилам. */
export const ORPHAN_KINDS = ['photo', 'resume', 'study', 'studentVideo'] as const;

/** Файл моложе этого срока не трогаем: его ещё могут успеть привязать к профилю или регистрации. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Больше стольких файлов за один запуск не удаляем: ошибка в проверке не должна стирать бакет целиком. */
export const ORPHAN_SWEEP_LIMIT = 500;

const OWN_FILE = /^\/api\/files\/([A-Za-z]+)\/([0-9a-f-]{36}\.[a-z0-9]{2,5})$/i;
const FILE_MENTION = /\/api\/files\/([A-Za-z]+)\/([0-9a-f-]{36}\.[a-z0-9]{2,5})/gi;

/** `kind/name` для адреса нашего загруженного файла; null — внешняя ссылка или чужой формат. */
function fileKey(url: string | null | undefined): string | null {
  const match = url ? OWN_FILE.exec(url) : null;
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Поля профиля, в которых хранится файл. Замена любого из них освобождает прежний файл.
 * Справка (studyDocUrl) убирается в своём маршруте (/api/students/me/study).
 */
const REPLACEABLE_FIELDS = ['photoUrl', 'resumeUrl', 'videoUrl'] as const;

/**
 * Удалить файлы, которые профиль только что перестал использовать. Зовётся после успешного
 * сохранения новых значений: пока в базе не новое значение, старый файл трогать нельзя.
 *
 * Файл, на который ссылается ещё какой-нибудь профиль (в том числе этот же — в другом поле),
 * остаётся: загрузка выдаёт уникальное имя, но ссылку в профиль студент присылает сам.
 * Внешние ссылки на видео (YouTube и т. п.) — не наши файлы, их нет смысла и нельзя удалять.
 * Сбой удаления не бросается: профиль уже сохранён, а недоубранное подберёт ночная уборка.
 */
export async function releaseReplacedFiles(
  store: DataStore,
  before: Pick<StudentRecord, (typeof REPLACEABLE_FIELDS)[number]>,
  after: Pick<StudentRecord, (typeof REPLACEABLE_FIELDS)[number]>,
): Promise<number> {
  let removed = 0;
  for (const field of REPLACEABLE_FIELDS) {
    const previous = before[field];
    if (!previous || previous === after[field] || !fileKey(previous)) continue;
    try {
      if (await store.students.findByFileUrl(previous)) continue;
      await deleteStored(previous);
      removed++;
    } catch (error) {
      console.error(`[файлы] прежний файл (${field}) не удалён:`, error);
    }
  }
  return removed;
}

/**
 * Какие файлы где-то используются: всё, что упомянуто в записях студентов и компаний.
 * Берётся не набор известных полей, а любое упоминание адреса файла в записи целиком, —
 * так файл, о котором вспомнили в тексте анкеты или в будущем поле, не окажется «сиротой».
 * Зашифрованные поля сюда не попадают, но файлов там и не хранится.
 */
export async function collectReferencedFiles(store: DataStore): Promise<Set<string>> {
  const found = new Set<string>();
  const scan = (record: unknown) => {
    for (const match of JSON.stringify(record).matchAll(FILE_MENTION)) found.add(`${match[1]}/${match[2]}`);
  };
  for (const student of await store.students.list()) scan(student);
  for (const employer of await store.employers.list()) scan(employer);
  return found;
}

export interface SweepOptions {
  now?: Date;
  /** По умолчанию ORPHAN_SWEEP_LIMIT */
  limit?: number;
  /** Не удалять, только посчитать и записать в журнал. По умолчанию — берётся из ORPHAN_FILE_SWEEP=dry */
  dryRun?: boolean;
}

export interface SweepResult {
  /** Файлов наших видов в хранилище */
  listed: number;
  /** Из них старше суток */
  candidates: number;
  /** Из них нигде не упомянутых */
  orphans: number;
  deleted: number;
  /** Не удалены, потому что перед самым удалением ссылка нашлась */
  skippedInUse: number;
  /** Сирот больше лимита: остальных подберёт следующая ночь */
  truncated: boolean;
  dryRun: boolean;
  /** Почему уборка не выполнялась вовсе */
  skipped?: string;
}

const EMPTY: SweepResult = {
  listed: 0,
  candidates: 0,
  orphans: 0,
  deleted: 0,
  skippedInUse: 0,
  truncated: false,
  dryRun: false,
};

/**
 * Ночная уборка файлов-сирот: загружены больше суток назад и не упомянуты ни в одном профиле.
 *
 * Меры против удаления нужного:
 *  • только наши виды и только имена вида `<uuid>.<расширение>`; чужое в бакете не трогаем;
 *  • файл моложе суток не трогаем — регистрация, форма профиля и сохранённая позже ссылка;
 *  • набор ссылок собирается по всем записям студентов и компаний целиком (collectReferencedFiles);
 *  • если ссылок не нашлось вовсе — это подозрение на не ту базу, ничего не удаляем;
 *  • перед каждым удалением ссылка перепроверяется точечным запросом — на случай, если профиль
 *    сохранили уже после того, как набор собран;
 *  • не больше ORPHAN_SWEEP_LIMIT удалений за запуск, самые старые первыми;
 *  • итог пишется в журнал аудита и в консоль сервера;
 *  • ORPHAN_FILE_SWEEP=off выключает уборку, =dry только считает.
 */
export async function sweepOrphanFiles(store: DataStore, options: SweepOptions = {}): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? ORPHAN_SWEEP_LIMIT;
  const mode = process.env.ORPHAN_FILE_SWEEP?.trim().toLowerCase();
  const dryRun = options.dryRun ?? mode === 'dry';

  if (mode === 'off') return { ...EMPTY, skipped: 'уборка файлов выключена (ORPHAN_FILE_SWEEP=off)' };

  const result: SweepResult = { ...EMPTY, dryRun };
  const listed = await listStoredFiles(ORPHAN_KINDS);
  result.listed = listed.length;

  const cutoff = now.getTime() - ORPHAN_GRACE_MS;
  const candidates = listed.filter((file) => file.modifiedAt.getTime() <= cutoff);
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const referenced = await collectReferencedFiles(store);
  if (referenced.size === 0) {
    result.skipped = 'в базе не найдено ни одной ссылки на файлы — похоже, база не та, ничего не удалено';
    console.warn(`[файлы] ${result.skipped}; кандидатов: ${candidates.length}`);
    await journal(store, result, []);
    return result;
  }

  const orphans = candidates
    .filter((file) => !referenced.has(`${file.kind}/${file.name}`))
    .sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());
  result.orphans = orphans.length;
  result.truncated = orphans.length > limit;

  const removed: string[] = [];
  for (const file of orphans.slice(0, limit)) {
    const url = `/api/files/${file.kind}/${file.name}`;
    try {
      // Последняя проверка: ссылку могли сохранить уже после сбора набора
      if (await store.students.findByFileUrl(url)) {
        result.skippedInUse++;
        continue;
      }
      if (!dryRun) await deleteStored(url);
      result.deleted += dryRun ? 0 : 1;
      removed.push(`${file.kind}/${file.name}`);
    } catch (error) {
      console.error(`[файлы] сирота не удалена (${file.kind}/${file.name}):`, error);
    }
  }

  console.log(
    `[файлы] уборка сирот${dryRun ? ' (пробный режим)' : ''}: в хранилище ${result.listed}, старше суток ${result.candidates}, ` +
      `без ссылок ${result.orphans}, удалено ${result.deleted}${result.truncated ? ' (достигнут лимит, остальное — в следующий раз)' : ''}`,
  );
  await journal(store, result, removed);
  return result;
}

/** Запись в журнал: цифры и до 20 имён файлов (случайные UUID, не ПДн) — чтобы удалённое можно было найти в версиях бакета. */
async function journal(store: DataStore, result: SweepResult, names: string[]): Promise<void> {
  try {
    await store.audit.log({
      accountId: null,
      actorLabel: 'SYSTEM',
      action: 'files.orphans.swept',
      entity: null,
      entityId: null,
      ip: null,
      userAgent: null,
      meta: {
        listed: result.listed,
        candidates: result.candidates,
        orphans: result.orphans,
        deleted: result.deleted,
        skippedInUse: result.skippedInUse,
        truncated: result.truncated,
        dryRun: result.dryRun,
        ...(result.skipped ? { skipped: result.skipped } : {}),
        sample: names.slice(0, 20),
      },
    });
  } catch (error) {
    console.error('[файлы] не удалось записать итог уборки в журнал:', error);
  }
}
