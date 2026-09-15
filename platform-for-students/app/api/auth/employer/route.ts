import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { hashToken } from '@/lib/security/crypto';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { HOME_BY_ROLE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { employerCodeSchema } from '@/lib/validation';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Вход работодателя по коду из CRM.
 *
 * Регистрации у работодателя нет: аккаунт заводит аккаунт-менеджер
 * агентства вместе с клиентом, а код выдаётся уже существующему
 * контакту. В базе лежит только хеш кода.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const limit = await rateLimit('employerCode', ip);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { code } = employerCodeSchema.parse(await request.json());
    const store = await getStore();
    const record = await store.accessCodes.findByHash(hashToken(code));

    if (!record || (record.expiresAt && record.expiresAt < new Date())) {
      await audit(null, { action: 'auth.employer.failed' }, request.headers);
      return fail(401, 'Код не найден или истёк. Запросите новый у вашего менеджера.', 'BAD_CODE');
    }

    const account = await store.accounts.findById(record.accountId);
    if (!account || !account.isActive || account.role !== 'EMPLOYER') {
      return fail(403, 'Доступ к кабинету закрыт', 'FORBIDDEN');
    }

    const employer = await store.employers.findByAccountId(account.id);
    const session: SessionUser = {
      accountId: account.id,
      role: 'EMPLOYER',
      profileId: employer?.id ?? null,
      name: employer?.companyName ?? 'Работодатель',
    };

    cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
    await store.accessCodes.markUsed(record.id);
    await store.accounts.touchLogin(account.id);
    await audit(session, { action: 'auth.employer', entity: 'Employer', entityId: employer?.id ?? null }, request.headers);

    return ok({ redirectTo: HOME_BY_ROLE.EMPLOYER, company: session.name });
  });
}
