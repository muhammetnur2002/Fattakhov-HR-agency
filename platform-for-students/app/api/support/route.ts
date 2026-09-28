import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { sendSupportMessage } from '@/lib/support';
import { supportMessageSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * «Написать в поддержку» на /help — без входа, поэтому почта в форме,
 * а не из сессии: гость, который спрашивает про регистрацию компании,
 * ещё не завёл аккаунт.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('support', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const input = supportMessageSchema.parse(await request.json());

    const delivered = await sendSupportMessage({
      fromEmail: input.email,
      fromName: input.name ?? undefined,
      body: input.body,
    });
    if (!delivered) {
      return fail(502, 'Не удалось отправить сообщение. Попробуйте ещё раз или напишите на почту.', 'MAIL_FAILED');
    }

    return ok({ sent: true });
  });
}
