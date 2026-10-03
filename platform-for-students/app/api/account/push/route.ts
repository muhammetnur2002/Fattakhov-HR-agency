import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { pushConfigured, pushPublicKey } from '@/lib/push/config';
import { endpointHash, pushServiceName } from '@/lib/push/guard';
import { MAX_DEVICES_PER_ACCOUNT, sendPushToSubscription } from '@/lib/push/send';
import { pushEndpointSchema, pushSubscriptionSchema } from '@/lib/push/validation';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Пуш-уведомления на устройства: включить и выключить.
 *
 * Подписка всегда за тем, кто вошёл: ни id, ни чего-либо ещё о человеке из
 * браузера не принимается — только сама подписка.
 */

/** Есть ли канал на сервере, открытый ключ для браузера и устройства человека (по отпечаткам). */
export async function GET() {
  return handle(async () => {
    const session = await requireRole('STUDENT', 'EMPLOYER');
    if (!pushConfigured()) return ok({ configured: false, publicKey: null, devices: [] });

    const devices = await (await getStore()).pushSubscriptions.listByAccount(session.accountId);
    return ok({
      configured: true,
      publicKey: pushPublicKey(),
      devices: devices.map((d) => ({ id: d.id, endpointHash: endpointHash(d.endpoint) })),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');
    // Страница без канала переключатель не показывает — сюда только в обход
    if (!pushConfigured()) return fail(503, 'Уведомления на устройства на сервере не подключены.', 'PUSH_OFF');

    const limit = await rateLimit('pushSubscribe', session.accountId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        400,
        'Браузер прислал подписку, которую нельзя принять. Обновите страницу и попробуйте ещё раз.',
        'BAD_SUBSCRIPTION',
      );
    }

    const store = await getStore();
    const saved = await store.pushSubscriptions.save(
      session.accountId,
      {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: request.headers.get('user-agent')?.slice(0, 512) ?? null,
      },
      MAX_DEVICES_PER_ACCOUNT,
    );
    await audit(session, { action: 'account.push.subscribe', entity: 'Account', entityId: session.accountId }, request.headers);

    // Проверочное уведомление — сразу и на это же устройство. Уведомления, включённые
    // «на словах», которые на деле не доходят, хуже выключенных: на них рассчитывают.
    // Так человек видит результат сразу, а отмершая подписка обнаруживается до
    // первого настоящего события.
    const outcome = await sendPushToSubscription(saved, {
      title: 'Уведомления включены',
      body: 'Новости по откликам и сообщениям будут приходить на это устройство.',
      url: session.role === 'EMPLOYER' ? '/employer' : '/feed',
      tag: 'push-enabled',
    });

    const service = pushServiceName(saved.endpoint);
    switch (outcome.state) {
      case 'sent':
        return ok({ ok: 'Готово: на это устройство отправлено проверочное уведомление.' });
      case 'gone':
        // Подписку отправка уже удалила — на её место встанет новая
        return fail(
          409,
          `Служба уведомлений (${service}) не узнала подписку этого браузера. Нажмите «Включить» ещё раз.`,
          'RESUBSCRIBE',
        );
      case 'rejected':
        return ok({
          warning:
            `Подписка сохранена, но служба уведомлений (${service}) не приняла проверочное ` +
            `уведомление (код ${outcome.status}). Если оно не придёт, отключите и включите уведомления снова.`,
        });
      case 'unreachable':
        return ok({
          warning:
            `Подписка сохранена, но сервер не смог связаться со службой уведомлений (${service}). ` +
            'Если проверочное уведомление не придёт, на это устройство уведомления пока не доходят — письма приходят как обычно.',
        });
    }
  });
}

/** Выключить на этом устройстве. Только свою подписку: чужая по адресу не находится. */
export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');
    const parsed = pushEndpointSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Не удалось определить подписку этого устройства.', 'BAD_SUBSCRIPTION');

    await (await getStore()).pushSubscriptions.deleteByEndpoint(session.accountId, parsed.data.endpoint);
    await audit(session, { action: 'account.push.unsubscribe', entity: 'Account', entityId: session.accountId }, request.headers);
    return ok({ ok: 'Уведомления на этом устройстве выключены.' });
  });
}
