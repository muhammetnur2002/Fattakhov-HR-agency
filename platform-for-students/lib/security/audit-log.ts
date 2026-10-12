import 'server-only';
import { getStore } from '@/lib/db';
import type { SessionUser } from '@/lib/types';
import { clientIp } from './rate-limit';

/**
 * Запись в журнал аудита — без обращения к запросу Next.js: заголовки приходят
 * параметром. Отсюда её же зовут ночная задача и проверки, а guards.audit() лишь
 * подставляет заголовки текущего запроса.
 */
export interface AuditInput {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Подпись актора в журнале: роль и идентификатор учётной записи, без имени.
 *
 * Раньше сюда писалось ФИО (`STUDENT:Иванов Иван`): при удалении профиля оно оставалось в
 * журнале навсегда — открытыми персональными данными. Идентификатор сам по себе человека
 * не называет; имя при просмотре подтягивается из аккаунта, пока он существует
 * (listAuditEntries в lib/services.ts).
 */
export function actorLabelFor(session: SessionUser | null): string {
  return session ? `${session.role}:${session.accountId}` : 'ANONYMOUS';
}

/**
 * Никогда не бросает: провал логирования не должен отменять действие,
 * которое пользователь уже совершил. Но и молчать нельзя — ошибка уходит
 * в консоль сервера.
 */
export async function recordAudit(
  session: SessionUser | null,
  input: AuditInput,
  requestHeaders: Headers,
  /** Подпись вместо обычной — для служебных вызовов без сессии (SERVICE) */
  actorLabel?: string,
): Promise<void> {
  try {
    const store = await getStore();
    await store.audit.log({
      accountId: session?.accountId ?? null,
      actorLabel: actorLabel ?? actorLabelFor(session),
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      ip: clientIp(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
      meta: input.meta ?? null,
    });
  } catch (err) {
    console.error('[audit] не удалось записать событие:', err);
  }
}
