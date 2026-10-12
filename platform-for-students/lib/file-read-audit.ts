import 'server-only';
import { getStore } from '@/lib/db';
import { recordAudit } from '@/lib/security/audit-log';
import type { SessionUser } from '@/lib/types';

/**
 * Журнал чтения документов студентов сотрудниками и служебными вызовами.
 *
 * Фото, резюме, справка и видео — персональные данные. Студент читает свои файлы сам, а
 * работодатель — по своему отклику (его просмотры ведёт CRM, см. app/api/service/employer/files);
 * здесь — то, что до сих пор следа не оставляло: администратор панели (сотрудник агентства)
 * и сервер CRM с общим секретом, который читает справки и файлы на проверку.
 *
 * В записи — кто (роль и accountId либо SERVICE), какой вид файла, чей это файл (идентификатор
 * профиля, не имя), когда и с какого IP. Имён и ФИО нет.
 *
 * Один и тот же актор, читающий один и тот же файл, пишется не чаще раза в 10 минут: страница
 * проверки при каждой перерисовке запрашивает картинку заново, и таблица иначе росла бы от
 * одного открытого окна.
 */

export const FILE_READ_DEDUPE_MS = 10 * 60_000;

/** Виды файлов, которые считаются персональными. Файлы компаний публичны и сюда не относятся. */
const PERSONAL_KINDS = new Set(['photo', 'resume', 'study', 'studentVideo']);

export const FILE_READ_ACTION = 'student.file.read';

export async function auditFileRead(input: {
  /** Сессия читающего; null — служебный вызов */
  session: SessionUser | null;
  /** Чтение по служебному секрету CRM */
  service: boolean;
  kind: string;
  name: string;
  headers: Headers;
  now?: Date;
}): Promise<void> {
  try {
    if (!PERSONAL_KINDS.has(input.kind)) return;
    // Студент и работодатель читают свои и «свои по отклику» файлы — это обычная работа, не доступ сотрудника
    const staff = input.session?.role === 'ADMIN';
    if (!input.service && !staff) return;

    const now = input.now ?? new Date();
    const store = await getStore();
    const session = input.service ? null : input.session;
    const actorLabel = session ? `${session.role}:${session.accountId}` : 'SERVICE';
    const entityId = `${input.kind}/${input.name}`;

    if (
      await store.audit.recentExists({
        action: FILE_READ_ACTION,
        actorLabel,
        entityId,
        since: new Date(now.getTime() - FILE_READ_DEDUPE_MS),
      })
    ) {
      return;
    }

    const owner = await store.students.findByFileUrl(`/api/files/${entityId}`);
    await recordAudit(
      session,
      {
        action: FILE_READ_ACTION,
        entity: 'File',
        entityId,
        meta: { kind: input.kind, ownerStudentId: owner?.id ?? null, via: input.service ? 'service' : 'admin' },
      },
      input.headers,
      actorLabel,
    );
  } catch (err) {
    // Журнал не должен отменять выдачу файла — но и молча терять запись нельзя
    console.error('[audit] не удалось записать чтение файла:', err);
  }
}
