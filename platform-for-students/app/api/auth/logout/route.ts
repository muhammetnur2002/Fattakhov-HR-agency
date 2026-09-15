import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { audit, assertSameOrigin, getSession } from '@/lib/security/guards';
import { SESSION_COOKIE } from '@/lib/security/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await getSession();
    cookies().delete(SESSION_COOKIE);
    if (session) await audit(session, { action: 'auth.logout' }, request.headers);
    return ok({ redirectTo: '/' });
  });
}
