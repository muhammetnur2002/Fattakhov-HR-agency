import { fail, handle, ok } from '@/lib/api';
import { listThreads, viewerFromSession } from '@/lib/chat';
import { getSession } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Список диалогов текущего участника. */
export async function GET() {
  return handle(async () => {
    const viewer = viewerFromSession(await getSession());
    if (!viewer) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    return ok({ threads: await listThreads(viewer) });
  });
}
