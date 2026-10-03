import { NextResponse } from 'next/server';
import { fail, handle, ok, tooManyRequests, type ApiError } from '@/lib/api';
import { requestPasswordReset } from '@/lib/account-email';
import { blindIndex } from '@/lib/security/crypto';
import { assertSameOrigin, audit } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { forgotPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * «Забыли пароль»: письмо со ссылкой.
 *
 * Ответ честный: нет такой учётки — так и говорим, чтобы человек проверил
 * адрес, а не ждал письмо, которое не придёт. Подбор адресов ограничен
 * лимитами по IP и по почте ниже.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const byIp = await rateLimit('passwordResetIp', clientIp(request.headers));
    if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

    const { email } = forgotPasswordSchema.parse(await request.json());
    const emailHash = blindIndex(email);
    const byAccount = await rateLimit('passwordReset', `acct:${emailHash}`);
    if (!byAccount.ok) return tooManyRequests(byAccount.retryAfter);

    const result = await requestPasswordReset(email);
    await audit(
      null,
      { action: 'auth.password.reset_requested', meta: { emailHash, result: result.status } },
      request.headers,
    );

    switch (result.status) {
      case 'SENT':
        return ok({ sent: true });
      case 'NO_ACCOUNT':
        return fail(404, 'Аккаунта с такой почтой нет. Проверьте адрес на опечатки или зарегистрируйтесь.', 'NO_ACCOUNT', {
          email: 'Аккаунта с такой почтой нет. Проверьте адрес на опечатки.',
        });
      case 'NO_PASSWORD':
        return fail(409, 'У этого аккаунта нет пароля: вход по коду. Новый код выдаёт ваш менеджер агентства.', 'NO_PASSWORD', {
          email: 'У этого аккаунта нет пароля: вход по коду от менеджера.',
        });
      case 'WAIT':
        return NextResponse.json<ApiError>(
          { error: `Письмо уже отправлено. Новое можно запросить через ${result.retryAfter} с.`, code: 'WAIT' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
        );
      case 'MAIL_FAILED':
        return fail(502, 'Не удалось отправить письмо. Попробуйте позже или напишите в поддержку.', 'MAIL_FAILED');
    }
  });
}
