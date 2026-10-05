import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { audit, assertSameOrigin, getSession } from '@/lib/security/guards';
import { SESSION_COOKIE } from '@/lib/security/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    // Куку снимаем первой: выход обязан работать и при сбое базы. getSession ходит в базу
    // (сверяет сессию с учётной записью), и упавшая база не должна оставлять человека вошедшим
    (await cookies()).delete(SESSION_COOKIE);
    try {
      const session = await getSession();
      if (session) await audit(session, { action: 'auth.logout' }, request.headers);
    } catch {
      /* запись в журнал — по возможности, выход уже состоялся */
    }
    return ok({ redirectTo: '/' });
  });
}
