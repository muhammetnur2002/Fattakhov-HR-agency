import { after, NextResponse } from 'next/server';
import { handle, tooManyRequests } from '@/lib/api';
import { requestPasswordReset } from '@/lib/account-email';
import { blindIndex } from '@/lib/security/crypto';
import { assertSameOrigin, audit } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { answerHonestly, resetReply } from '@/lib/security/reset-hints';
import { forgotPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * «Забыли пароль»: письмо со ссылкой.
 *
 * Ответ честный, но не безграничный: нет такой учётки — так и говорим, чтобы человек проверил
 * адрес, а не ждал письмо, которое не придёт. Однако только на первые три промаха с одного адреса
 * за час (lib/security/reset-hints.ts); с четвёртого на всё отвечаем одинаково и нейтрально —
 * иначе форма годилась бы для проверки списка адресов. Адрес — настоящий, из clientIp():
 * заголовки от клиента счёт не обнуляют. Лимиты по IP и по почте ниже стоят дополнительно.
 *
 * Письмо уходит после ответа (after): если ждать SMTP, время ответа выдавало бы, что аккаунт
 * есть. Сбой отправки наружу не показывается вовсе — только в журнал сервера и аудита.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const byIp = await rateLimit('passwordResetIp', ip);
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

    if (result.status === 'SENT') {
      const { deliver } = result;
      after(async () => {
        const delivered = await deliver().catch(() => false);
        if (!delivered) {
          console.error('[сброс пароля] письмо не отправлено', { emailHash });
          await audit(null, { action: 'auth.password.reset_mail_failed', meta: { emailHash } }, request.headers);
        }
      });
    }

    // Нейтральный ответ неотличим от настоящего «письмо отправлено» — и текстом, и формой
    const reply = resetReply(result, await answerHonestly(ip, result.status));
    return NextResponse.json(reply.body, {
      status: reply.status,
      ...(reply.retryAfter ? { headers: { 'Retry-After': String(reply.retryAfter) } } : {}),
    });
  });
}
