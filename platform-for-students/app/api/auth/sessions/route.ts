import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { audit, assertSameOrigin, getSession } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { SESSION_COOKIE } from '@/lib/security/session';

export const runtime = 'nodejs';

/**
 * «Выйти на всех устройствах».
 *
 * Сессия — подписанный JWT, отозвать по одной нечем. Но каждая несёт время
 * выпуска, а `resolveSession` отвергает выпущенные раньше passwordChangedAt
 * (lib/security/session-resolve.ts). Метку передвигаем на «сейчас»: все
 * выданные сессии, включая украденные, перестают действовать, пароль остаётся
 * прежним. Это ответ на кражу cookie: пароль ей не нужен, а отозвать её
 * иначе, кроме смены пароля, было нечем. Текущую куку снимаем тут же.
 *
 * Сотрудникам из CRM (роль ADMIN) не нужно: их сессия короткая и выдаётся
 * по билету, а общая отметка учётки в CRM-билетах не участвует.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    if (session.role === 'ADMIN') return fail(403, 'Недоступно для этой роли', 'FORBIDDEN');

    const limit = await rateLimit('revokeSessions', `${session.accountId}:${clientIp(request.headers)}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const store = await getStore();
    await store.accounts.revokeSessions(session.accountId);
    (await cookies()).delete(SESSION_COOKIE);
    await audit(session, { action: 'auth.sessions.revoked', entity: 'Account', entityId: session.accountId }, request.headers);

    return ok({ redirectTo: '/login?reason=sessions-revoked' });
  });
}
