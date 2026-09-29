import { handle, ok } from '@/lib/api';
import { listThreads } from '@/lib/chat';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Диалоги клиента CRM со студентами — служебный аналог /api/messages.
 * Читает сам клиент в своём кабинете CRM; сотрудники агентства сюда не
 * ходят (см. комментарий в lib/chat.ts: их в переписку это не пускает).
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer } = await requireServiceEmployer(crmClientId);
    return ok({ threads: await listThreads({ role: 'EMPLOYER', profileId: employer.id }) });
  });
}
