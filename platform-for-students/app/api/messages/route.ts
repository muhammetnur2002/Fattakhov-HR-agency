import { fail, handle, ok } from '@/lib/api';
import { countAgencyUnreadForStudent } from '@/lib/agency-chat';
import { listThreads, viewerFromSession } from '@/lib/chat';
import { getSession } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список диалогов текущего участника. */
export async function GET() {
  return handle(async () => {
    const viewer = viewerFromSession(await getSession());
    if (!viewer) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    // Переписка с агентством живёт отдельно от диалогов по откликам; её непрочитанное
    // отдаём рядом, чтобы значок в навигации не терял его после обновления
    const agencyUnread = viewer.role === 'STUDENT' ? await countAgencyUnreadForStudent(viewer.profileId) : 0;
    return ok({ threads: await listThreads(viewer), agencyUnread });
  });
}
