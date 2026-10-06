import { handle, ok } from '@/lib/api';
import { assertSameOrigin, HttpError, requireRole } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Показ статуса «в сети» и «был(а) …» собеседникам — всегда включён.
 *
 * Раньше студент и работодатель могли его выключить. Теперь скрыть статус
 * на платформе нельзя (правило владельца проекта; в CRM его скрывает только
 * владелец агентства): переключателя в интерфейсе нет, а эта ручка осталась
 * лишь для вкладок, открытых до обновления, — она ничего не меняет.
 */
export async function GET() {
  return handle(async () => {
    await requireRole('STUDENT', 'EMPLOYER');
    return ok({ show: true });
  });
}

/** Выключить показ нельзя: отказ, в базу ничего не пишется и в журнал не попадает. */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireRole('STUDENT', 'EMPLOYER');
    throw new HttpError(403, 'Статус «в сети» скрыть нельзя: он виден собеседникам всегда', 'PRESENCE_ALWAYS_ON');
  });
}
