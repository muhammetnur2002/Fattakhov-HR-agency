import { handle, ok, tooManyRequests } from '@/lib/api';
import { pushConfigured } from '@/lib/push/config';
import { sendPushToAccount } from '@/lib/push/send';
import { PUSH_BODY } from '@/lib/notify';
import { assertSameOrigin, requireRole } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Отправить проверочное уведомление» на все устройства человека.
 *
 * Нужна, чтобы человек сам видел, доходит ли пуш, не дожидаясь настоящего
 * события: при включении уведомлений пробное уходит один раз, а дальше
 * проверить было нечем. Отвечает, скольким устройствам службу уведомлений
 * удалось сообщить — это и есть «ушло», дальнейшее зависит от самого
 * устройства (сеть, разрешения браузера и системы).
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');
    if (!pushConfigured()) return ok({ configured: false, devices: 0, sent: 0, removed: 0, failed: 0 });

    const limit = await rateLimit('pushSubscribe', `test:${session.accountId}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const delivery = await sendPushToAccount(session.accountId, {
      title: 'Проверка уведомлений',
      body: PUSH_BODY,
      url: session.role === 'EMPLOYER' ? '/employer' : '/feed',
      tag: 'push-test',
      urgency: 'high',
    });
    return ok({
      configured: true,
      devices: delivery.outcomes.length,
      sent: delivery.sent,
      removed: delivery.removed,
      failed: delivery.failed,
    });
  });
}
