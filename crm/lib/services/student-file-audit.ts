import { prismaRaw } from "@/lib/db/prisma";
import { clientIp } from "@/lib/security/rate-limit";

/**
 * Журнал чтения документов студентов через CRM (152-ФЗ, BR-36).
 *
 * Справка об обучении и фото студента — персональные данные, которые
 * сотрудник агентства открывает прокси-маршрутом, минуя карточки кандидатов.
 * Раньше такое чтение не оставляло следа. Пишем в тот же журнал, что и
 * просмотр кандидатов (PersonalDataAccessLog), без новой таблицы:
 *
 *  - action — вид документа (student_*_view), по нему журнал подписывает запись;
 *  - candidateId — не кандидат, а метка объекта студенческой платформы:
 *    «student-file:<id файла>» или «student-application:<id отклика>».
 *    Ни ФИО, ни содержимого в записи нет, только идентификатор;
 *  - actorId — кто открыл (роль берётся из его учётной записи при показе);
 *  - ip — адрес из заголовка, как в остальных записях журнала.
 *
 * Сбой журнала не должен ни ронять выдачу файла, ни тормозить её, поэтому
 * recordStudentFileRead никогда не бросает, а маршрут не ждёт её завершения.
 */

/** Вид документа студента, который открыли. */
export type StudentFileKind =
  | "photo"
  | "study"
  | "applicant_photo"
  | "applicant_resume";

/** Значения action в журнале. Подписи по-русски — в ACCESS_ACTION_LABELS. */
export const STUDENT_FILE_ACTIONS: Record<StudentFileKind, string> = {
  photo: "student_photo_view",
  study: "student_study_view",
  applicant_photo: "student_applicant_photo_view",
  applicant_resume: "student_applicant_resume_view",
};

/** Метки объектов в поле candidateId (отличают документ студента от карточки кандидата). */
export const STUDENT_FILE_TARGET_PREFIX = "student-file:";
export const STUDENT_APPLICATION_TARGET_PREFIX = "student-application:";

/** Не чаще одной записи на пару «пользователь — документ» за это время. */
export const STUDENT_FILE_THROTTLE_MS = 10 * 60 * 1000;

/** Больше записей в памяти не держим: просроченные вычищаются, когда набралось. */
const THROTTLE_SWEEP_AT = 5000;

/** Когда последний раз писали пару «пользователь — документ». Память процесса, с TTL. */
const lastRecorded = new Map<string, number>();

/** Для тестов: забыть, что уже писали. */
export function resetStudentFileAuditThrottle(): void {
  lastRecorded.clear();
}

/** Метка объекта для поля candidateId. Длина ограничена: id идёт из запроса. */
export function studentFileTarget(kind: StudentFileKind, objectId: string): string {
  const prefix =
    kind === "photo" || kind === "study"
      ? STUDENT_FILE_TARGET_PREFIX
      : STUDENT_APPLICATION_TARGET_PREFIX;
  return `${prefix}${objectId.slice(0, 64)}`;
}

/** Идентификатор файла из пути вида /api/files/study/<uuid>.pdf. */
export function studentFileIdFromPath(path: string): string | null {
  return /^\/api\/files\/(?:photo|study)\/([0-9a-f-]{36})\.[a-z0-9]{2,5}$/i.exec(path)?.[1] ?? null;
}

export async function recordStudentFileRead(
  actor: { id: string; organizationId: string },
  input: { kind: StudentFileKind; objectId: string },
  headers?: Headers,
): Promise<void> {
  const target = studentFileTarget(input.kind, input.objectId);
  const key = `${actor.id}|${input.kind}|${target}`;
  const now = Date.now();

  const last = lastRecorded.get(key);
  if (last !== undefined && now - last < STUDENT_FILE_THROTTLE_MS) return;

  if (lastRecorded.size >= THROTTLE_SWEEP_AT) {
    for (const [k, at] of lastRecorded) {
      if (now - at >= STUDENT_FILE_THROTTLE_MS) lastRecorded.delete(k);
    }
  }
  // Ключ занимаем до записи, чтобы параллельные запросы (<img> и открытие
  // в новой вкладке) не продублировали строку; при сбое — освобождаем
  lastRecorded.set(key, now);

  try {
    const ip = headers ? clientIp(headers) : "unknown";
    await prismaRaw.personalDataAccessLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        candidateId: target,
        action: STUDENT_FILE_ACTIONS[input.kind],
        ip: ip === "unknown" ? undefined : ip,
      },
    });
  } catch (error) {
    lastRecorded.delete(key);
    console.error("[журнал ПДн] чтение документа студента не записано", error);
  }
}
